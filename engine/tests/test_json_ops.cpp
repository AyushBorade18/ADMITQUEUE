// Tests for the JSON protocol layer: parsing, validation, and every operation's output.
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

#include "json.hpp"
#include "json_ops.h"

using aqjson::Value;

static int g_checks = 0, g_failed = 0;
#define CHECK(cond)                                                                    \
  do {                                                                                 \
    ++g_checks;                                                                        \
    if (!(cond)) { ++g_failed; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)
static std::vector<std::pair<std::string, std::function<void()>>>& registry() { static std::vector<std::pair<std::string, std::function<void()>>> r; return r; }
struct Reg { Reg(const char* n, std::function<void()> f) { registry().push_back({n, f}); } };
#define TEST(name) static void name(); static Reg reg_##name(#name, name); static void name()

// Runs a request and parses the reply (the reply must always be valid JSON).
static Value call(const std::string& request) {
  std::string reply = admitqueue::handleRequest(request);
  return aqjson::parse(reply);
}
static bool isOk(const Value& v) { return v.at("ok").asBool(); }
static std::string errCode(const Value& v) { return v.at("error").asString(); }
static std::vector<long long> ints(const Value& arr) {
  std::vector<long long> out;
  for (const Value& v : arr.items()) out.push_back(v.asInt());
  return out;
}
using IV = std::vector<long long>;

// ============================ JSON parser / writer ============================
TEST(json_parses_values_and_escapes) {
  Value v = aqjson::parse("{\"a\":[1,-2,3.5,true,false,null],\"s\":\"x\\n\\\"q\\\" \\u00e9 \\ud83d\\ude00\"}");
  CHECK(v.at("a").items().size() == 6);
  CHECK(v.at("a").items()[1].asInt() == -2);
  CHECK(v.at("a").items()[2].asDouble() == 3.5);
  CHECK(v.at("a").items()[3].asBool());
  CHECK(v.at("a").items()[5].isNull());
  CHECK(v.at("s").asString() == "x\n\"q\" \xC3\xA9 \xF0\x9F\x98\x80");
  Value round = aqjson::parse(v.dump());
  CHECK(round.at("s").asString() == v.at("s").asString());
}

TEST(json_rejects_malformed_input) {
  const char* bad[] = {"", "{", "{\"a\":}", "[1,]", "{\"a\" 1}", "nul", "\"abc", "{\"a\":1} extra", "[1 2]",
                       "{\"a\":\"\\q\"}", "01", "1.", "\"\\ud800\"", "{'a':1}", "[\"tab\there\"]"};
  for (const char* b : bad) {
    bool threw = false;
    try { aqjson::parse(b); } catch (const aqjson::JsonError&) { threw = true; }
    CHECK(threw);
  }
}

TEST(json_limits_nesting_depth) {
  std::string deep(200, '[');
  deep += std::string(200, ']');
  bool threw = false;
  try { aqjson::parse(deep); } catch (const aqjson::JsonError&) { threw = true; }
  CHECK(threw);
}

// ============================ protocol errors ============================
TEST(protocol_reports_errors_as_json) {
  CHECK(errCode(call("not json")) == "BAD_JSON");
  CHECK(errCode(call("")) == "BAD_JSON");
  CHECK(errCode(call("[1,2]")) == "BAD_REQUEST");
  CHECK(errCode(call("{}")) == "BAD_REQUEST");
  CHECK(errCode(call("{\"op\":\"nope\"}")) == "UNKNOWN_OP");
  CHECK(errCode(call("{\"op\":\"search\",\"mode\":\"name\",\"query\":\"a\"}")) == "BAD_REQUEST");        // students missing
  CHECK(errCode(call("{\"op\":\"search\",\"mode\":\"zzz\",\"query\":\"a\",\"students\":[]}")) == "BAD_REQUEST");
  CHECK(errCode(call("{\"op\":\"rank_worklist\",\"mode\":\"bad\",\"items\":[]}")) == "BAD_REQUEST");
}

TEST(health_runs_the_data_structures) {
  Value r = call("{\"op\":\"health\"}");
  CHECK(isOk(r) && r.at("result").at("selfCheck").asBool());
  CHECK(r.at("engine").asString() == admitqueue::ENGINE_NAME);
}

// ============================ searching ============================
static const char* kStudents =
    "[{\"id\":0,\"appId\":\"MH2026-10003\",\"name\":\"Rohan Joshi\"},"
    "{\"id\":1,\"appId\":\"MH2026-10001\",\"name\":\"Aarav Deshmukh\"},"
    "{\"id\":2,\"appId\":\"MH2026-10002\",\"name\":\"Sneha Patil\"},"
    "{\"id\":3,\"appId\":\"MH2026-10020\",\"name\":\"Meera Kulkarni\"}]";

TEST(search_by_application_id_prefix_uses_binary_search) {
  Value r = call(std::string("{\"op\":\"search\",\"mode\":\"app_prefix\",\"query\":\"mh2026-1000\",\"students\":") + kStudents + "}");
  CHECK(isOk(r));
  CHECK((ints(r.at("result").at("matches")) == IV{1, 2, 0}));    // sorted by application id
  CHECK(r.at("result").at("stats").at("algorithm").asString().find("binary") != std::string::npos);
  Value exact = call(std::string("{\"op\":\"search\",\"mode\":\"app_prefix\",\"query\":\"MH2026-10020\",\"students\":") + kStudents + "}");
  CHECK((ints(exact.at("result").at("matches")) == IV{3}));
  Value none = call(std::string("{\"op\":\"search\",\"mode\":\"app_prefix\",\"query\":\"XX\",\"students\":") + kStudents + "}");
  CHECK(isOk(none) && none.at("result").at("matches").items().empty());
}

TEST(search_by_name_uses_linear_search_over_all_records) {
  Value r = call(std::string("{\"op\":\"search\",\"mode\":\"name\",\"query\":\"kul\",\"students\":") + kStudents + "}");
  CHECK(isOk(r) && (ints(r.at("result").at("matches")) == IV{3}));
  CHECK(r.at("result").at("stats").at("comparisons").asInt() == 4);   // every record examined
  Value empty = call("{\"op\":\"search\",\"mode\":\"name\",\"query\":\"x\",\"students\":[]}");
  CHECK(isOk(empty) && empty.at("result").at("matches").items().empty());
}

// ============================ hash table ============================
TEST(hash_lookup_finds_cap_ids_and_reports_missing_ones) {
  Value r = call("{\"op\":\"hash_lookup\",\"records\":[{\"key\":\"A1\",\"id\":10},{\"key\":\"B2\",\"id\":20}],\"queries\":[\"B2\",\"ZZ\",\"A1\"]}");
  CHECK(isOk(r));
  const auto& f = r.at("result").at("found").items();
  CHECK(f.size() == 3 && f[0].at("id").asInt() == 20 && f[1].at("id").isNull() && f[2].at("id").asInt() == 10);
}

TEST(hash_lookup_handles_duplicate_keys_and_many_records) {
  std::string recs = "[";
  for (int i = 0; i < 2000; ++i) { if (i) recs += ","; recs += "{\"key\":\"K" + std::to_string(i) + "\",\"id\":" + std::to_string(i) + "}"; }
  recs += ",{\"key\":\"K5\",\"id\":999}]";                       // duplicate key: the last one wins
  Value r = call("{\"op\":\"hash_lookup\",\"records\":" + recs + ",\"queries\":[\"K5\",\"K1999\"]}");
  CHECK(isOk(r) && r.at("result").at("found").items()[0].at("id").asInt() == 999);
  CHECK(r.at("result").at("found").items()[1].at("id").asInt() == 1999);
  CHECK(r.at("result").at("tableSize").asInt() == 2000);
}

TEST(import_check_classifies_new_duplicate_and_existing_ids) {
  Value r = call("{\"op\":\"import_check\",\"existing\":[\"A\",\"B\"],\"incoming\":[\"C\",\"A\",\"C\",\"D\",\"B\"]}");
  CHECK(isOk(r));
  const auto& s = r.at("result").at("status").items();
  CHECK(s[0].asString() == "new" && s[1].asString() == "already_exists" && s[2].asString() == "duplicate_in_file");
  CHECK(s[3].asString() == "new" && s[4].asString() == "already_exists");
  CHECK(r.at("result").at("new").asInt() == 2 && r.at("result").at("duplicateInFile").asInt() == 1);
  Value empty = call("{\"op\":\"import_check\",\"existing\":[],\"incoming\":[]}");
  CHECK(isOk(empty) && empty.at("result").at("status").items().empty());
  CHECK(errCode(call("{\"op\":\"import_check\",\"existing\":[1],\"incoming\":[]}")) == "BAD_REQUEST");
}

// ============================ merge sort ============================
TEST(rank_worklist_orders_by_level_then_waiting_time_then_name) {
  Value r = call("{\"op\":\"rank_worklist\",\"mode\":\"unscheduled\",\"items\":["
                 "{\"id\":1,\"level\":3,\"waitKey\":100,\"name\":\"Zed\"},"
                 "{\"id\":2,\"level\":1,\"waitKey\":500,\"name\":\"Amy\"},"
                 "{\"id\":3,\"level\":3,\"waitKey\":50,\"name\":\"Bob\"},"
                 "{\"id\":4,\"level\":3,\"waitKey\":50,\"name\":\"Abe\"},"
                 "{\"id\":5,\"level\":2,\"waitKey\":10,\"name\":\"Cat\"}]}");
  CHECK(isOk(r));
  CHECK((ints(r.at("result").at("order")) == IV{2, 5, 4, 3, 1}));
  CHECK(r.at("result").at("stats").at("algorithm").asString() == "merge sort");
}

TEST(rank_worklist_is_stable_and_handles_empty_and_single) {
  Value same = call("{\"op\":\"rank_worklist\",\"mode\":\"arrivals_time\",\"items\":[{\"id\":9,\"name\":\"a\"},{\"id\":8,\"name\":\"a\"},{\"id\":7,\"name\":\"a\"}]}");
  CHECK((ints(same.at("result").at("order")) == IV{9, 8, 7}));   // identical keys keep the input order
  Value empty = call("{\"op\":\"rank_worklist\",\"mode\":\"arrivals_token\",\"items\":[]}");
  CHECK(isOk(empty) && empty.at("result").at("order").items().empty());
  Value one = call("{\"op\":\"rank_worklist\",\"mode\":\"arrivals_priority\",\"items\":[{\"id\":4}]}");
  CHECK((ints(one.at("result").at("order")) == IV{4}));
}

// ============================ queue / heap ============================
static std::string tok(int seq, int level, const char* status, int counter, const char* app) {
  return "{\"seq\":" + std::to_string(seq) + ",\"level\":" + std::to_string(level) + ",\"status\":\"" + status +
         "\",\"counterId\":" + std::to_string(counter) + ",\"studentId\":" + std::to_string(seq) + ",\"appId\":\"" + app + "\"}";
}

TEST(queue_calls_priority_students_first_and_ties_by_arrival) {
  std::string tokens = "[" + tok(1, 3, "waiting", 0, "a") + "," + tok(2, 3, "waiting", 0, "b") + "," +
                       tok(3, 2, "waiting", 0, "c") + "," + tok(4, 1, "waiting", 0, "d") + "," + tok(5, 1, "waiting", 0, "e") + "]";
  Value r = call("{\"op\":\"queue_step\",\"fairness\":3,\"counters\":[{\"id\":1,\"open\":true}],\"tokens\":" + tokens +
                 ",\"action\":{\"type\":\"call\",\"counterId\":1}}");
  CHECK(isOk(r));
  CHECK(r.at("result").at("action").at("ok").asBool());
  CHECK(r.at("result").at("action").at("token").at("code").asString() == "P004");   // level 1, earliest arrival
  const auto& waiting = r.at("result").at("snapshot").at("waiting").items();
  CHECK(waiting.size() == 4 && waiting[0].at("code").asString() == "P005" && waiting[1].at("code").asString() == "P003");
  CHECK(r.at("result").at("streak").asInt() == 1);
}

TEST(queue_fairness_lets_a_regular_student_in_after_a_priority_burst) {
  std::string tokens = "[" + tok(1, 3, "waiting", 0, "a") + "," + tok(2, 1, "waiting", 0, "b") + "," + tok(3, 1, "waiting", 0, "c") + "]";
  // streak already at the burst limit (2): the oldest regular student must be called next.
  Value r = call("{\"op\":\"queue_step\",\"fairness\":2,\"streak\":2,\"counters\":[{\"id\":1,\"open\":true}],\"tokens\":" + tokens +
                 ",\"action\":{\"type\":\"call\",\"counterId\":1}}");
  CHECK(isOk(r) && r.at("result").at("action").at("token").at("code").asString() == "R001");
  CHECK(r.at("result").at("streak").asInt() == 0);
}

TEST(queue_lifecycle_start_complete_noshow_cancel) {
  std::string tokens = "[" + tok(1, 3, "called", 1, "a") + "," + tok(2, 3, "waiting", 0, "b") + "]";
  std::string base = "{\"op\":\"queue_step\",\"fairness\":3,\"counters\":[{\"id\":1,\"open\":true}],\"tokens\":" + tokens;
  Value started = call(base + ",\"action\":{\"type\":\"start\",\"code\":\"R001\"}}");
  CHECK(isOk(started) && started.at("result").at("action").at("token").at("status").asString() == "serving");
  Value noshow = call(base + ",\"action\":{\"type\":\"noshow\",\"code\":\"R001\"}}");
  CHECK(isOk(noshow) && noshow.at("result").at("action").at("token").at("status").asString() == "no_show");
  Value cancel = call(base + ",\"action\":{\"type\":\"cancel\",\"code\":\"R002\"}}");
  CHECK(isOk(cancel) && cancel.at("result").at("action").at("token").at("status").asString() == "cancelled");
  Value bad = call(base + ",\"action\":{\"type\":\"complete\",\"code\":\"R404\"}}");
  CHECK(isOk(bad) && !bad.at("result").at("action").at("ok").asBool());
}

TEST(queue_handles_empty_queue_busy_counters_and_bad_input) {
  Value empty = call("{\"op\":\"queue_step\",\"counters\":[{\"id\":1,\"open\":true}],\"tokens\":[],\"action\":{\"type\":\"call\",\"counterId\":1}}");
  CHECK(isOk(empty) && !empty.at("result").at("action").at("ok").asBool());
  CHECK(errCode(call("{\"op\":\"queue_step\",\"counters\":[],\"tokens\":[" + tok(1, 3, "called", 7, "a") + "]}")) == "UNKNOWN_COUNTER");
  CHECK(errCode(call("{\"op\":\"queue_step\",\"counters\":[],\"tokens\":[" + tok(1, 9, "waiting", 0, "a") + "]}")) == "BAD_ARGUMENT");
  CHECK(errCode(call("{\"op\":\"queue_step\",\"counters\":[],\"tokens\":[" + tok(1, 3, "waiting", 0, "a") + "," + tok(1, 3, "waiting", 0, "a") + "]}")) == "DUPLICATE_TOKEN");
  CHECK(errCode(call("{\"op\":\"queue_step\",\"fairness\":0,\"counters\":[],\"tokens\":[]}")) == "BAD_REQUEST");
  CHECK(errCode(call("{\"op\":\"queue_step\",\"counters\":[],\"tokens\":[],\"action\":{\"type\":\"explode\"}}")) == "BAD_REQUEST");
}

TEST(progress_rank_orders_by_score_then_arrival) {
  Value r = call("{\"op\":\"progress_rank\",\"students\":["
                 "{\"studentId\":1,\"token\":\"t1\",\"score\":0.5,\"enteredAt\":\"2026-01-02\"},"
                 "{\"studentId\":2,\"token\":\"t2\",\"score\":0.9,\"enteredAt\":\"2026-01-05\"},"
                 "{\"studentId\":3,\"token\":\"t3\",\"score\":0.5,\"enteredAt\":\"2026-01-01\"}]}");
  CHECK(isOk(r));
  const auto& ranked = r.at("result").at("ranked").items();
  CHECK(ranked.size() == 3 && ranked[0].at("studentId").asInt() == 2 && ranked[1].at("studentId").asInt() == 3 && ranked[2].at("studentId").asInt() == 1);
}

// ============================ stack ============================
TEST(undo_stack_pops_the_newest_entry_first) {
  Value r = call("{\"op\":\"undo_stack\",\"action\":\"pop\",\"adminId\":1,\"entries\":["
                 "{\"actionId\":1,\"studentId\":10,\"kind\":\"stage\"},{\"actionId\":2,\"studentId\":11,\"kind\":\"stage\"},{\"actionId\":3,\"studentId\":12,\"kind\":\"record\"}]}");
  CHECK(isOk(r) && r.at("result").at("entry").at("actionId").asInt() == 3);
  CHECK(r.at("result").at("size").asInt() == 2);
  Value peek = call("{\"op\":\"undo_stack\",\"action\":\"peek\",\"entries\":[{\"actionId\":7}]}");
  CHECK(peek.at("result").at("entry").at("actionId").asInt() == 7 && peek.at("result").at("size").asInt() == 1);
  Value empty = call("{\"op\":\"undo_stack\",\"action\":\"pop\",\"entries\":[]}");
  CHECK(isOk(empty) && empty.at("result").at("entry").isNull());
}

TEST(undo_stack_is_bounded_and_drops_the_oldest) {
  Value r = call("{\"op\":\"undo_stack\",\"action\":\"push\",\"capacity\":2,\"entries\":[{\"actionId\":1},{\"actionId\":2}],\"entry\":{\"actionId\":3}}");
  CHECK(isOk(r) && r.at("result").at("dropped").items().size() == 1 && r.at("result").at("dropped").items()[0].at("actionId").asInt() == 1);
  CHECK(r.at("result").at("remaining").items()[0].at("actionId").asInt() == 3);   // newest first
  CHECK(errCode(call("{\"op\":\"undo_stack\",\"action\":\"explode\",\"entries\":[]}")) == "BAD_REQUEST");
  CHECK(errCode(call("{\"op\":\"undo_stack\",\"capacity\":0,\"entries\":[]}")) == "BAD_REQUEST");
}

// ============================ matrices ============================
TEST(appointment_load_uses_a_sparse_matrix) {
  Value r = call("{\"op\":\"appointment_load\",\"rows\":3,\"cols\":10,\"fromCol\":2,\"toCol\":6,\"bookings\":[[0,2],[0,2],[0,3],[2,5]]}");
  CHECK(isOk(r));
  CHECK(r.at("result").at("nonZeros").asInt() == 3);
  CHECK((ints(r.at("result").at("rowSums")) == IV{3, 0, 1}));
  CHECK(r.at("result").at("busiest").items()[0].items()[2].asInt() == 2);       // cell (0,2) has 2 bookings
  CHECK(r.at("result").at("bestSlots").items()[0].items()[0].asInt() == 4);     // day 0: first empty slot in [2,6)
  CHECK(isOk(call("{\"op\":\"appointment_load\",\"rows\":1,\"cols\":1,\"fromCol\":0,\"toCol\":1,\"bookings\":[]}")));
  CHECK(errCode(call("{\"op\":\"appointment_load\",\"rows\":1,\"cols\":2,\"fromCol\":0,\"toCol\":2,\"bookings\":[[5,0]]}")) == "BAD_REQUEST");
  CHECK(errCode(call("{\"op\":\"appointment_load\",\"rows\":1,\"cols\":2,\"fromCol\":2,\"toCol\":1,\"bookings\":[]}")) == "BAD_REQUEST");
}

TEST(doc_readiness_uses_a_dense_matrix) {
  Value r = call("{\"op\":\"doc_readiness\",\"docs\":2,\"rounds\":2,\"roundTotals\":[10,0],\"cells\":[{\"doc\":0,\"round\":0,\"count\":8},{\"doc\":1,\"round\":0,\"count\":3}]}");
  CHECK(isOk(r));
  CHECK((ints(r.at("result").at("counts")) == IV{8, 0, 3, 0}));
  CHECK(r.at("result").at("percent").items()[0].asDouble() == 80.0);
  CHECK((ints(r.at("result").at("weakestDoc")) == IV{1, -1}));
  CHECK(errCode(call("{\"op\":\"doc_readiness\",\"docs\":1,\"rounds\":2,\"roundTotals\":[1],\"cells\":[]}")) == "BAD_REQUEST");
}

// ============================ allotment through JSON ============================
TEST(allotment_round1_through_json_returns_new_state) {
  Value r = call("{\"op\":\"allotment\",\"action\":\"round1\",\"courses\":[{\"id\":1,\"label\":\"A\",\"seats\":1},{\"id\":2,\"label\":\"B\",\"seats\":1}],"
                 "\"students\":[{\"id\":10,\"rank\":2,\"verified\":true,\"prefs\":[1,2]},{\"id\":11,\"rank\":1,\"verified\":true,\"prefs\":[1,2]},{\"id\":12,\"rank\":3,\"verified\":true,\"prefs\":[1]}]}");
  CHECK(isOk(r) && r.at("result").at("success").asBool() && r.at("result").at("round").asInt() == 1);
  const auto& s = r.at("result").at("students").items();
  CHECK(s[0].at("id").asInt() == 11 && s[0].at("allotment").asInt() == 1);       // merit order, best first
  CHECK(s[1].at("id").asInt() == 10 && s[1].at("allotment").asInt() == 2 && s[1].at("prefNo").asInt() == 2);
  CHECK(s[2].at("status").asInt() == 2);                                        // WAITING
  CHECK((ints(r.at("result").at("waiting")) == IV{12}));
  CHECK(r.at("result").at("courses").items()[0].at("filled").asInt() == 1);
}

TEST(allotment_reports_rule_violations_and_bad_input) {
  Value again = call("{\"op\":\"allotment\",\"action\":\"round1\",\"round\":1,\"courses\":[],\"students\":[]}");
  CHECK(isOk(again) && !again.at("result").at("success").asBool());
  CHECK(errCode(call("{\"op\":\"allotment\",\"action\":\"explode\",\"courses\":[],\"students\":[]}")) == "BAD_REQUEST");
  CHECK(errCode(call("{\"op\":\"allotment\",\"action\":\"round1\",\"courses\":[{\"id\":1,\"seats\":1,\"filled\":5}],\"students\":[]}")) == "BAD_REQUEST");
  Value cancel = call("{\"op\":\"allotment\",\"action\":\"cancel\",\"studentId\":10,\"round\":1,\"courses\":[{\"id\":1,\"seats\":1,\"filled\":1}],"
                      "\"students\":[{\"id\":10,\"rank\":1,\"verified\":true,\"prefs\":[1],\"status\":1,\"allotment\":1,\"prefNo\":1}]}");
  CHECK(cancel.at("result").at("success").asBool() && cancel.at("result").at("courses").items()[0].at("filled").asInt() == 0);
  Value verify = call("{\"op\":\"allotment\",\"action\":\"verify_next\",\"courses\":[],\"students\":[{\"id\":1,\"rank\":1,\"verified\":false}],\"verificationQueue\":[1]}");
  CHECK(verify.at("result").at("success").asBool() && verify.at("result").at("students").items()[0].at("verified").asBool());
}

int main() {
  for (auto& t : registry()) {
    int before = g_failed;
    t.second();
    std::printf("%s %s\n", g_failed == before ? "PASS" : "FAIL", t.first.c_str());
  }
  std::printf("\n%d tests, %d checks, %d failed\n", static_cast<int>(registry().size()), g_checks, g_failed);
  return g_failed == 0 ? 0 : 1;
}
