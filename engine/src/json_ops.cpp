// JSON operations. Each function below validates its part of the request and then calls the real data
// structures / algorithms of the engine. Nothing here re-implements an algorithm.
#include "json_ops.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

#include "algo/merge_sort.hpp"
#include "allotment.h"
#include "dsa/hash_map.hpp"
#include "json.hpp"
#include "planner.h"
#include "progress_queue.h"
#include "protocol.h"
#include "queue_engine.h"
#include "reports.h"
#include "search_index.h"
#include "undo_stacks.h"

using aqjson::JsonError;
using aqjson::Value;

namespace admitqueue {

const char* const ENGINE_NAME = "admitqueue-engine/1.0";

namespace {

const std::size_t MAX_ITEMS = 20000;   // safety limit for every list in a request

// Raised for requests that are well-formed JSON but violate the protocol.
struct OpError {
  std::string code;
  std::string message;
};

Value errorReply(const std::string& code, const std::string& message) {
  Value v = Value::object();
  v.set("ok", Value::boolean(false));
  v.set("error", Value::string(code));
  v.set("message", Value::string(message));
  return v;
}

const std::vector<Value>& listField(const Value& req, const char* key, bool required = true) {
  static const std::vector<Value> empty;
  const Value* v = req.find(key);
  if (v == nullptr || v->isNull()) {
    if (required) throw OpError{"BAD_REQUEST", std::string("missing list \"") + key + "\""};
    return empty;
  }
  if (!v->isArray()) throw OpError{"BAD_REQUEST", std::string("\"") + key + "\" must be a list"};
  if (v->items().size() > MAX_ITEMS) throw OpError{"TOO_MANY_ITEMS", std::string("\"") + key + "\" has too many items"};
  return v->items();
}

std::string strField(const Value& obj, const char* key) {
  const Value* v = obj.find(key);
  if (v == nullptr || !v->isString()) throw OpError{"BAD_REQUEST", std::string("\"") + key + "\" must be a string"};
  return v->asString();
}

long long intField(const Value& obj, const char* key) {
  const Value* v = obj.find(key);
  if (v == nullptr || !v->isNumber()) throw OpError{"BAD_REQUEST", std::string("\"") + key + "\" must be a number"};
  return v->asInt();
}

long long intFieldOr(const Value& obj, const char* key, long long fallback) {
  const Value* v = obj.find(key);
  if (v == nullptr || v->isNull()) return fallback;
  if (!v->isNumber()) throw OpError{"BAD_REQUEST", std::string("\"") + key + "\" must be a number"};
  return v->asInt();
}

std::string strFieldOr(const Value& obj, const char* key, const std::string& fallback) {
  const Value* v = obj.find(key);
  if (v == nullptr || v->isNull()) return fallback;
  if (!v->isString()) throw OpError{"BAD_REQUEST", std::string("\"") + key + "\" must be a string"};
  return v->asString();
}

double numFieldOr(const Value& obj, const char* key, double fallback) {
  const Value* v = obj.find(key);
  if (v == nullptr || v->isNull()) return fallback;
  if (!v->isNumber()) throw OpError{"BAD_REQUEST", std::string("\"") + key + "\" must be a number"};
  return v->asDouble();
}

Value idList(const std::vector<long long>& ids) {
  Value a = Value::array();
  for (long long id : ids) a.push(Value::integer(id));
  return a;
}

Value statsJson(const admitflow::SearchStats& s) {
  Value v = Value::object();
  v.set("algorithm", Value::string(s.algorithm));
  v.set("comparisons", Value::integer(static_cast<long long>(s.comparisons)));
  v.set("size", Value::integer(static_cast<long long>(s.size)));
  return v;
}

// ------------------------------------------------------------------------------------------- health

Value opHealth(const Value&) {
  Value r = Value::object();
  r.set("status", Value::string("ok"));
  r.set("engine", Value::string(ENGINE_NAME));
  Value ops = Value::array();
  const char* names[] = {"health", "search", "hash_lookup", "import_check", "rank_worklist", "queue_step",
                         "undo_stack", "appointment_load", "doc_readiness", "progress_rank", "allotment"};
  for (const char* n : names) ops.push(Value::string(n));
  r.set("ops", ops);
  // A tiny self-check that proves the data structures run: heap + hash map + merge sort.
  admitflow::HashMap<std::string, long long, admitflow::StringHash> probe;
  probe.put("A", 1);
  std::vector<int> v = {3, 1, 2};
  admitflow::mergeSort(v, [](int a, int b) { return a < b; });
  r.set("selfCheck", Value::boolean(probe.contains("A") && v[0] == 1 && v[2] == 3));
  return r;
}

// ------------------------------------------------------------------------------------------- search
// Binary search on application IDs / tokens, linear search on names (SearchIndex).
Value opSearch(const Value& req) {
  const std::string mode = strField(req, "mode");
  const std::string query = strField(req, "query");
  if (query.size() > 100) throw OpError{"BAD_REQUEST", "query too long"};
  admitflow::SearchIndex index;
  for (const Value& s : listField(req, "students")) {
    index.addStudent(intField(s, "id"), strField(s, "appId"), strFieldOr(s, "name", ""));
  }
  for (const Value& t : listField(req, "tokens", false)) {
    std::string lane = strField(t, "lane");
    if (lane.size() != 1) throw OpError{"BAD_REQUEST", "token lane must be one letter"};
    index.addToken(static_cast<int>(intField(t, "number")), lane[0], intField(t, "studentId"));
  }
  std::size_t buildComparisons = index.build();
  admitflow::SearchStats stats;
  std::vector<long long> matches;
  if (mode == "app_prefix") {
    matches = index.findByApplicationPrefix(query, stats);
  } else if (mode == "name") {
    matches = index.findByName(query, stats);
  } else if (mode == "token") {
    long long studentId = 0;
    if (index.findToken(query, studentId, stats)) matches.push_back(studentId);
  } else {
    throw OpError{"BAD_REQUEST", "mode must be app_prefix, name or token"};
  }
  Value r = Value::object();
  r.set("matches", idList(matches));
  r.set("stats", statsJson(stats));
  r.set("buildComparisons", Value::integer(static_cast<long long>(buildComparisons)));
  return r;
}

// ------------------------------------------------------------------------------------------- hash table
// CAP ID lookup in a supplied collection (HashMap, separate chaining).
Value opHashLookup(const Value& req) {
  admitflow::HashMap<std::string, long long, admitflow::StringHash> table;
  for (const Value& rec : listField(req, "records")) table.put(strField(rec, "key"), intField(rec, "id"));
  Value found = Value::array();
  for (const Value& q : listField(req, "queries")) {
    if (!q.isString()) throw OpError{"BAD_REQUEST", "queries must be strings"};
    const long long* id = table.find(q.asString());
    Value row = Value::object();
    row.set("query", q);
    row.set("id", id == nullptr ? Value() : Value::integer(*id));
    found.push(row);
  }
  Value r = Value::object();
  r.set("found", found);
  r.set("tableSize", Value::integer(static_cast<long long>(table.size())));
  return r;
}

// CSV import preview: which incoming CAP IDs are new, repeated inside the file, or already stored.
Value opImportCheck(const Value& req) {
  admitflow::HashMap<std::string, int, admitflow::StringHash> seen;   // 1 = already in database, 2 = seen in this file
  for (const Value& e : listField(req, "existing")) {
    if (!e.isString()) throw OpError{"BAD_REQUEST", "existing must be strings"};
    seen.put(e.asString(), 1);
  }
  Value rows = Value::array();
  long long nNew = 0, nFile = 0, nExisting = 0;
  for (const Value& in : listField(req, "incoming")) {
    if (!in.isString()) throw OpError{"BAD_REQUEST", "incoming must be strings"};
    const int* state = seen.find(in.asString());
    std::string status;
    if (state == nullptr) { status = "new"; seen.put(in.asString(), 2); ++nNew; }
    else if (*state == 1) { status = "already_exists"; ++nExisting; }
    else { status = "duplicate_in_file"; ++nFile; }
    rows.push(Value::string(status));
  }
  Value r = Value::object();
  r.set("status", rows);
  r.set("new", Value::integer(nNew));
  r.set("duplicateInFile", Value::integer(nFile));
  r.set("alreadyExists", Value::integer(nExisting));
  return r;
}

// ------------------------------------------------------------------------------------------- merge sort
Value opRankWorklist(const Value& req) {
  admitflow::SortMode mode;
  if (!admitflow::parseSortMode(strField(req, "mode"), mode)) {
    throw OpError{"BAD_REQUEST", "mode must be unscheduled, arrivals_time, arrivals_priority or arrivals_token"};
  }
  std::vector<admitflow::WorkItem> items;
  for (const Value& it : listField(req, "items")) {
    admitflow::WorkItem w;
    w.id = intField(it, "id");
    w.level = static_cast<int>(intFieldOr(it, "level", 3));
    w.minutes = static_cast<int>(intFieldOr(it, "minutes", 0));
    w.token = static_cast<int>(intFieldOr(it, "token", 0));
    w.waitKey = intFieldOr(it, "waitKey", 0);
    w.name = admitflow::SearchIndex::lower(strFieldOr(it, "name", ""));
    items.push_back(w);
  }
  std::size_t comparisons = admitflow::sortWork(items, mode);
  std::vector<long long> order;
  for (const auto& w : items) order.push_back(w.id);
  Value r = Value::object();
  r.set("order", idList(order));
  r.set("stats", [&] {
    Value s = Value::object();
    s.set("algorithm", Value::string("merge sort"));
    s.set("comparisons", Value::integer(static_cast<long long>(comparisons)));
    s.set("size", Value::integer(static_cast<long long>(items.size())));
    return s;
  }());
  return r;
}

// ------------------------------------------------------------------------------------------- queue / heap
admitflow::Status parseStatus(const std::string& s) {
  if (s == "waiting") return admitflow::Status::Waiting;
  if (s == "called") return admitflow::Status::Called;
  if (s == "serving") return admitflow::Status::Serving;
  throw OpError{"BAD_REQUEST", "token status must be waiting, called or serving"};
}

// Service-desk scheduling: FIFO lane + priority heap + fairness rule (QueueEngine).
Value opQueueStep(const Value& req) {
  long long fairness = intFieldOr(req, "fairness", 3);
  if (fairness < 1 || fairness > 1000) throw OpError{"BAD_REQUEST", "fairness must be 1-1000"};
  admitflow::QueueEngine engine(static_cast<int>(fairness));
  engine.reset(static_cast<int>(fairness));

  for (const Value& c : listField(req, "counters")) {
    admitflow::Result r = engine.setCounter(static_cast<int>(intField(c, "id")), c.at("open").asBool());
    if (!r.ok) throw OpError{r.error, r.message};
  }
  for (const Value& t : listField(req, "tokens", false)) {
    admitflow::Token tok;
    tok.seq = static_cast<int>(intField(t, "seq"));
    tok.level = static_cast<int>(intField(t, "level"));
    tok.status = parseStatus(strField(t, "status"));
    tok.counterId = static_cast<int>(intFieldOr(t, "counterId", 0));
    tok.studentId = intFieldOr(t, "studentId", 0);
    tok.appId = strField(t, "appId");
    admitflow::Result r = engine.load(tok);
    if (!r.ok) throw OpError{r.error, r.message};
  }
  engine.setLastSeq(static_cast<int>(intFieldOr(req, "lastSeq", 0)));
  engine.setStreak(static_cast<int>(intFieldOr(req, "streak", 0)));

  admitflow::Result result;
  const Value* action = req.find("action");
  std::string type = (action != nullptr && action->isObject()) ? strField(*action, "type") : "snapshot";
  if (type == "call") result = engine.callNext(static_cast<int>(intField(*action, "counterId")));
  else if (type == "start") result = engine.start(strField(*action, "code"));
  else if (type == "complete") result = engine.complete(strField(*action, "code"));
  else if (type == "noshow") result = engine.noShow(strField(*action, "code"));
  else if (type == "cancel") result = engine.cancel(strField(*action, "code"));
  else if (type == "close_counter") result = engine.setCounter(static_cast<int>(intField(*action, "counterId")), false);
  else if (type == "open_counter") result = engine.setCounter(static_cast<int>(intField(*action, "counterId")), true);
  else if (type != "snapshot") throw OpError{"BAD_REQUEST", "unknown queue action"};

  Value r = Value::object();
  r.set("action", aqjson::parse(admitflow::resultJson(engine, result)));
  r.set("snapshot", aqjson::parse(admitflow::snapshotJson(engine.snapshot())));
  r.set("streak", Value::integer(engine.streak()));
  return r;
}

// Admission follow-up ranking: max-heap + hash map (AdmissionProgressHeap).
Value opProgressRank(const Value& req) {
  admitflow::AdmissionProgressHeap heap;
  for (const Value& s : listField(req, "students")) {
    heap.upsert(intField(s, "studentId"), strField(s, "token"), numFieldOr(s, "score", 0), strFieldOr(s, "enteredAt", ""));
  }
  Value ranked = Value::array();
  int position = 1;
  for (const admitflow::ProgressStudent& s : heap.getRanked()) {
    Value row = Value::object();
    row.set("position", Value::integer(position++));
    row.set("studentId", Value::integer(s.studentId));
    row.set("token", Value::string(s.token));
    row.set("score", Value::number(s.score));
    ranked.push(row);
  }
  Value r = Value::object();
  r.set("ranked", ranked);
  r.set("size", Value::integer(static_cast<long long>(heap.size())));
  return r;
}

// ------------------------------------------------------------------------------------------- stack
Value undoEntry(const admitflow::UndoEntry& e) {
  Value v = Value::object();
  v.set("actionId", Value::integer(e.actionId));
  v.set("studentId", Value::integer(e.studentId));
  v.set("kind", Value::string(e.kind));
  return v;
}

admitflow::UndoEntry parseUndo(const Value& v) {
  admitflow::UndoEntry e;
  e.actionId = intField(v, "actionId");
  e.studentId = intFieldOr(v, "studentId", 0);
  e.kind = strFieldOr(v, "kind", "");
  return e;
}

// Undo history: one bounded stack per admin (Stack inside a HashMap). `entries` is oldest -> newest.
Value opUndoStack(const Value& req) {
  long long capacity = intFieldOr(req, "capacity", 20);
  if (capacity < 1 || capacity > 1000) throw OpError{"BAD_REQUEST", "capacity must be 1-1000"};
  long long adminId = intFieldOr(req, "adminId", 1);
  admitflow::UndoStacks stacks(static_cast<std::size_t>(capacity));
  Value dropped = Value::array();
  for (const Value& e : listField(req, "entries", false)) {
    admitflow::UndoEntry gone;
    if (!stacks.push(adminId, parseUndo(e), &gone)) { /* never fails for bounded stacks: oldest falls off */ }
  }
  const std::string action = strFieldOr(req, "action", "list");
  Value r = Value::object();
  if (action == "push") {
    admitflow::UndoEntry gone;
    bool droppedOne = stacks.push(adminId, parseUndo(req.at("entry")), &gone);
    if (droppedOne) dropped.push(undoEntry(gone));
  } else if (action == "pop") {
    admitflow::UndoEntry top;
    bool ok = stacks.pop(adminId, top);
    r.set("entry", ok ? undoEntry(top) : Value());
  } else if (action == "peek") {
    const admitflow::UndoEntry* top = stacks.peek(adminId);
    r.set("entry", top == nullptr ? Value() : undoEntry(*top));
  } else if (action != "list") {
    throw OpError{"BAD_REQUEST", "action must be push, pop, peek or list"};
  }
  Value remaining = Value::array();
  for (const auto& e : stacks.list(adminId)) remaining.push(undoEntry(e));   // newest first
  r.set("remaining", remaining);
  r.set("size", Value::integer(static_cast<long long>(stacks.size(adminId))));
  r.set("dropped", dropped);
  return r;
}

// ------------------------------------------------------------------------------------------- matrices
Value cellList(const std::vector<admitflow::LoadCell>& cells) {
  Value a = Value::array();
  for (const auto& c : cells) {
    Value row = Value::array();
    row.push(Value::integer(c.row)).push(Value::integer(c.col)).push(Value::integer(c.count));
    a.push(row);
  }
  return a;
}

Value intList(const std::vector<int>& xs) {
  Value a = Value::array();
  for (int x : xs) a.push(Value::integer(x));
  return a;
}

Value opAppointmentLoad(const Value& req) {
  long long rows = intField(req, "rows"), cols = intField(req, "cols");
  if (rows > 400 || cols > 400) throw OpError{"BAD_REQUEST", "grid too large"};
  std::vector<std::pair<int, int>> bookings;
  for (const Value& b : listField(req, "bookings", false)) {
    if (!b.isArray() || b.items().size() != 2) throw OpError{"BAD_REQUEST", "booking must be [day, slot]"};
    bookings.push_back({static_cast<int>(b.items()[0].asInt()), static_cast<int>(b.items()[1].asInt())});
  }
  admitflow::LoadReport rep;
  if (!admitflow::computeAppointmentLoad(static_cast<int>(rows), static_cast<int>(cols),
                                         static_cast<int>(intField(req, "fromCol")),
                                         static_cast<int>(intField(req, "toCol")), bookings, rep)) {
    throw OpError{"BAD_REQUEST", "booking outside the grid or bad slot range"};
  }
  Value r = Value::object();
  r.set("rows", Value::integer(rep.rows));
  r.set("cols", Value::integer(rep.cols));
  r.set("nonZeros", Value::integer(static_cast<long long>(rep.nonZeros)));
  r.set("density", Value::number(rep.density));
  r.set("cells", cellList(rep.cells));
  r.set("rowSums", intList(rep.rowSums));
  r.set("colSums", intList(rep.colSums));
  r.set("busiest", cellList(rep.busiest));
  Value best = Value::array();
  for (const auto& b : rep.bestSlots) {
    Value pair = Value::array();
    pair.push(Value::integer(b.col)).push(Value::integer(b.count));
    best.push(pair);
  }
  r.set("bestSlots", best);
  r.set("lookupComparisons", Value::integer(static_cast<long long>(rep.lookupComparisons)));
  return r;
}

Value opDocReadiness(const Value& req) {
  long long docs = intField(req, "docs"), rounds = intField(req, "rounds");
  if (docs > 100 || rounds > 100) throw OpError{"BAD_REQUEST", "grid too large"};
  std::vector<int> totals;
  for (const Value& t : listField(req, "roundTotals")) totals.push_back(static_cast<int>(t.asInt()));
  std::vector<admitflow::DocCount> cells;
  for (const Value& c : listField(req, "cells", false)) {
    cells.push_back({static_cast<int>(intField(c, "doc")), static_cast<int>(intField(c, "round")),
                     static_cast<int>(intField(c, "count"))});
  }
  admitflow::ReadinessReport rep;
  if (!admitflow::computeDocReadiness(static_cast<int>(docs), static_cast<int>(rounds), totals, cells, rep)) {
    throw OpError{"BAD_REQUEST", "bad readiness grid"};
  }
  Value r = Value::object();
  r.set("docs", Value::integer(rep.docs));
  r.set("rounds", Value::integer(rep.rounds));
  r.set("counts", intList(rep.counts));
  Value pct = Value::array();
  for (double p : rep.percent) pct.push(Value::number(std::round(p * 100.0) / 100.0));
  r.set("percent", pct);
  r.set("docTotals", intList(rep.docTotals));
  r.set("roundTotals", intList(rep.roundTotals));
  r.set("weakestDoc", intList(rep.weakestDoc));
  r.set("strongestDoc", intList(rep.strongestDoc));
  return r;
}

// ------------------------------------------------------------------------------------------- allotment
// Project (1) logic: linked list + FIFO queue + bubble sort (see include/allotment.h). DEMO ONLY.
Value opAllotment(const Value& req) {
  AllotmentSimulator sim;
  for (const Value& c : listField(req, "courses")) {
    SimCourse course;
    course.id = intField(c, "id");
    course.label = strFieldOr(c, "label", "");
    course.seats = static_cast<int>(intField(c, "seats"));
    course.filled = static_cast<int>(intFieldOr(c, "filled", 0));
    if (course.seats < 0 || course.filled < 0 || course.filled > course.seats) {
      throw OpError{"BAD_REQUEST", "course seats/filled are inconsistent"};
    }
    sim.addCourse(course);
  }
  for (const Value& s : listField(req, "students")) {
    SimStudent st;
    st.id = intField(s, "id");
    st.name = strFieldOr(s, "name", "");
    st.rank = static_cast<int>(intFieldOr(s, "rank", 0));
    st.verified = s.at("verified").asBool();
    const Value* prefs = s.find("prefs");
    if (prefs != nullptr && prefs->isArray()) {
      if (prefs->items().size() > static_cast<std::size_t>(MAX_PREF)) throw OpError{"BAD_REQUEST", "too many preferences"};
      for (const Value& p : prefs->items()) st.pref[st.prefCount++] = static_cast<int>(p.asInt());
    }
    st.status = static_cast<int>(intFieldOr(s, "status", NOT_ALLOCATED));
    st.allotment = intFieldOr(s, "allotment", 0);
    st.prefNo = static_cast<int>(intFieldOr(s, "prefNo", 0));
    st.round = static_cast<int>(intFieldOr(s, "round", 0));
    st.remark = strFieldOr(s, "remark", "");
    sim.addStudent(st);
  }
  sim.currentRound = static_cast<int>(intFieldOr(req, "round", 0));
  for (const Value& w : listField(req, "waiting", false)) sim.waitingQueue.enqueue(w.asInt());
  for (const Value& q : listField(req, "verificationQueue", false)) sim.verificationQueue.enqueue(q.asInt());

  const std::string action = strField(req, "action");
  SimResult res;
  if (action == "round1") res = sim.runRound1();
  else if (action == "round2") res = sim.runRound2();
  else if (action == "promote") res = sim.promoteWaiting();
  else if (action == "verify_next") res = sim.verifyNext();
  else if (action == "freeze") res = sim.freezeSeat(intField(req, "studentId"));
  else if (action == "cancel") res = sim.cancelAdmission(intField(req, "studentId"));
  else throw OpError{"BAD_REQUEST", "unknown allotment action"};

  Value r = Value::object();
  r.set("success", Value::boolean(res.ok));
  r.set("message", Value::string(res.message));
  r.set("round", Value::integer(sim.currentRound));
  Value students = Value::array();
  for (SimNode* n = sim.head(); n != nullptr; n = n->next) {
    const SimStudent& s = n->data;
    Value row = Value::object();
    row.set("id", Value::integer(s.id));
    row.set("rank", Value::integer(s.rank));
    row.set("verified", Value::boolean(s.verified));
    row.set("status", Value::integer(s.status));
    row.set("allotment", s.allotment == 0 ? Value() : Value::integer(s.allotment));
    row.set("prefNo", Value::integer(s.prefNo));
    row.set("round", Value::integer(s.round));
    row.set("remark", Value::string(s.remark));
    students.push(row);
  }
  r.set("students", students);   // in merit order after a round
  Value courses = Value::array();
  for (const SimCourse& c : sim.courses()) {
    Value row = Value::object();
    row.set("id", Value::integer(c.id));
    row.set("filled", Value::integer(c.filled));
    row.set("seats", Value::integer(c.seats));
    courses.push(row);
  }
  r.set("courses", courses);
  r.set("waiting", idList(sim.waitingQueue.toVector()));
  r.set("verificationQueue", idList(sim.verificationQueue.toVector()));
  return r;
}

Value dispatch(const Value& req) {
  if (!req.isObject()) throw OpError{"BAD_REQUEST", "request must be a JSON object"};
  const std::string op = strField(req, "op");
  Value result;
  if (op == "health") result = opHealth(req);
  else if (op == "search") result = opSearch(req);
  else if (op == "hash_lookup") result = opHashLookup(req);
  else if (op == "import_check") result = opImportCheck(req);
  else if (op == "rank_worklist") result = opRankWorklist(req);
  else if (op == "queue_step") result = opQueueStep(req);
  else if (op == "undo_stack") result = opUndoStack(req);
  else if (op == "appointment_load") result = opAppointmentLoad(req);
  else if (op == "doc_readiness") result = opDocReadiness(req);
  else if (op == "progress_rank") result = opProgressRank(req);
  else if (op == "allotment") result = opAllotment(req);
  else throw OpError{"UNKNOWN_OP", "unknown operation: " + op.substr(0, 40)};
  Value reply = Value::object();
  reply.set("ok", Value::boolean(true));
  reply.set("op", Value::string(op));
  reply.set("engine", Value::string(ENGINE_NAME));
  reply.set("result", result);
  return reply;
}

}  // namespace

std::string handleRequest(const std::string& requestText) {
  try {
    Value request = aqjson::parse(requestText);
    return dispatch(request).dump();
  } catch (const OpError& e) {
    return errorReply(e.code, e.message).dump();
  } catch (const JsonError& e) {
    return errorReply("BAD_JSON", e.what()).dump();
  } catch (const std::exception& e) {
    return errorReply("ENGINE_ERROR", e.what()).dump();
  }
}

}  // namespace admitqueue
