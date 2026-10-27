// Tests for the allotment simulator (the logic taken over from Project (1)).
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

#include "allotment.h"

using namespace admitqueue;

static int g_checks = 0, g_failed = 0;
#define CHECK(cond)                                                                    \
  do {                                                                                 \
    ++g_checks;                                                                        \
    if (!(cond)) { ++g_failed; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)
static std::vector<std::pair<std::string, std::function<void()>>>& registry() { static std::vector<std::pair<std::string, std::function<void()>>> r; return r; }
struct Reg { Reg(const char* n, std::function<void()> f) { registry().push_back({n, f}); } };
#define TEST(name) static void name(); static Reg reg_##name(#name, name); static void name()

static SimStudent student(long long id, int rank, bool verified, std::vector<int> prefs) {
  SimStudent s;
  s.id = id;
  s.name = "S" + std::to_string(id);
  s.rank = rank;
  s.verified = verified;
  for (int p : prefs) s.pref[s.prefCount++] = p;
  return s;
}
static SimCourse course(long long id, int seats) {
  SimCourse c;
  c.id = id;
  c.label = "Course " + std::to_string(id);
  c.seats = seats;
  return c;
}
static SimStudent get(AllotmentSimulator& sim, long long id) { return sim.searchStudent(id)->data; }

TEST(queue_is_first_in_first_out_and_handles_empty) {
  SimQueue q;
  CHECK(q.empty() && q.size() == 0 && q.dequeue() == -1);
  q.enqueue(7); q.enqueue(3); q.enqueue(9);
  CHECK(q.size() == 3);
  CHECK(q.dequeue() == 7 && q.dequeue() == 3);
  q.enqueue(1);
  CHECK((q.toVector() == std::vector<long long>{9, 1}));
  q.clear();
  CHECK(q.empty() && q.dequeue() == -1);
}

TEST(merit_sort_orders_by_rank_and_keeps_ties_in_input_order) {
  AllotmentSimulator sim;
  sim.addStudent(student(1, 30, true, {}));
  sim.addStudent(student(2, 10, true, {}));
  sim.addStudent(student(3, 20, true, {}));
  sim.addStudent(student(4, 10, true, {}));   // ties with student 2
  sim.sortMerit();
  std::vector<long long> order;
  for (SimNode* n = sim.head(); n; n = n->next) order.push_back(n->data.id);
  CHECK((order == std::vector<long long>{2, 4, 3, 1}));
}

TEST(sort_and_search_work_on_empty_and_single_lists) {
  AllotmentSimulator empty;
  empty.sortMerit();
  CHECK(empty.searchStudent(1) == nullptr);
  SimResult r = empty.runRound1();
  CHECK(r.ok && empty.currentRound == 1);
  AllotmentSimulator one;
  one.addCourse(course(1, 1));
  one.addStudent(student(5, 1, true, {1}));
  one.sortMerit();
  CHECK(one.searchStudent(5) != nullptr && one.searchStudent(6) == nullptr);
  CHECK(one.runRound1().ok && get(one, 5).status == ALLOCATED);
}

TEST(round1_gives_seats_in_merit_order_and_respects_preferences) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 1));
  sim.addCourse(course(2, 2));
  // Added out of merit order on purpose.
  sim.addStudent(student(30, 3, true, {1, 2}));
  sim.addStudent(student(10, 1, true, {1, 2}));
  sim.addStudent(student(20, 2, true, {1, 2}));
  sim.addStudent(student(40, 4, true, {1}));          // only wants course 1, which fills up
  SimResult r = sim.runRound1();
  CHECK(r.ok);
  CHECK(get(sim, 10).allotment == 1 && get(sim, 10).prefNo == 1);
  CHECK(get(sim, 20).allotment == 2 && get(sim, 20).prefNo == 2);
  CHECK(get(sim, 30).allotment == 2 && get(sim, 30).prefNo == 2);
  CHECK(get(sim, 40).status == WAITING && get(sim, 40).allotment == 0);
  CHECK((sim.waitingQueue.toVector() == std::vector<long long>{40}));
  for (const SimCourse& c : sim.courses()) CHECK(c.filled <= c.seats);
}

TEST(round1_skips_unverified_students_and_students_without_preferences) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 5));
  sim.addStudent(student(1, 1, false, {1}));   // not verified
  sim.addStudent(student(2, 2, true, {}));     // no preferences
  sim.addStudent(student(3, 3, true, {1}));
  CHECK(sim.runRound1().ok);
  CHECK(get(sim, 1).status == NOT_ALLOCATED && get(sim, 2).status == NOT_ALLOCATED);
  CHECK(get(sim, 3).status == ALLOCATED);
  CHECK(sim.waitingQueue.empty());
}

TEST(round1_ignores_unknown_courses_and_cannot_run_twice) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 1));
  sim.addStudent(student(1, 1, true, {99, 1}));   // 99 does not exist
  CHECK(sim.runRound1().ok);
  CHECK(get(sim, 1).allotment == 1 && get(sim, 1).prefNo == 2);
  SimResult again = sim.runRound1();
  CHECK(!again.ok);
}

TEST(freeze_and_cancel_validate_state_and_release_seats) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 1));
  sim.addStudent(student(1, 1, true, {1}));
  sim.addStudent(student(2, 2, true, {1}));
  sim.runRound1();
  CHECK(!sim.freezeSeat(2).ok);                  // waiting students have nothing to freeze
  CHECK(!sim.freezeSeat(999).ok);                // unknown student
  CHECK(sim.freezeSeat(1).ok && get(sim, 1).status == FROZEN);
  CHECK(!sim.freezeSeat(1).ok);                  // already frozen
  CHECK(!sim.cancelAdmission(2).ok);             // no admission to cancel
  CHECK(sim.cancelAdmission(1).ok);
  CHECK(get(sim, 1).status == CANCELLED && get(sim, 1).allotment == 0);
  CHECK(sim.courses()[0].filled == 0);           // seat released
}

TEST(promote_moves_the_first_fitting_waiting_student_and_keeps_queue_order) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 1));
  sim.addCourse(course(2, 1));
  sim.addStudent(student(1, 1, true, {1}));
  sim.addStudent(student(2, 2, true, {1}));      // waits (wants only course 1)
  sim.addStudent(student(3, 3, true, {2}));      // gets course 2
  sim.addStudent(student(4, 4, true, {1}));      // waits
  sim.runRound1();
  CHECK((sim.waitingQueue.toVector() == std::vector<long long>{2, 4}));
  CHECK(!sim.promoteWaiting().ok);               // nothing is free yet
  CHECK((sim.waitingQueue.toVector() == std::vector<long long>{2, 4}));   // order unchanged
  sim.cancelAdmission(1);                        // course 1 becomes free
  SimResult r = sim.promoteWaiting();
  CHECK(r.ok);
  CHECK(get(sim, 2).status == ALLOCATED && get(sim, 2).allotment == 1);  // first in the queue wins
  CHECK((sim.waitingQueue.toVector() == std::vector<long long>{4}));
}

TEST(promote_needs_round1_and_a_waiting_list) {
  AllotmentSimulator sim;
  CHECK(!sim.promoteWaiting().ok);
  sim.addCourse(course(1, 5));
  sim.addStudent(student(1, 1, true, {1}));
  sim.runRound1();
  CHECK(!sim.promoteWaiting().ok);               // waiting list is empty
}

TEST(round2_betterment_moves_students_to_a_better_preference) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 1));
  sim.addCourse(course(2, 2));
  sim.addStudent(student(1, 1, true, {1, 2}));
  sim.addStudent(student(2, 2, true, {1, 2}));   // round 1: course 2 (preference 2)
  sim.addStudent(student(3, 3, true, {1}));      // waits
  sim.runRound1();
  CHECK(get(sim, 2).allotment == 2 && get(sim, 3).status == WAITING);
  sim.cancelAdmission(1);                        // frees course 1
  SimResult r = sim.runRound2();
  CHECK(r.ok && sim.currentRound == 2);
  CHECK(get(sim, 2).allotment == 1 && get(sim, 2).prefNo == 1);          // better preference
  CHECK(get(sim, 3).status == WAITING);                                  // course 1 was taken by student 2
  CHECK(sim.courses()[1].filled == 0);                                   // the seat student 2 left is free
  CHECK(!sim.runRound2().ok);                                            // only once
}

TEST(round2_requires_round1_and_gives_fresh_seats_to_waiting_students) {
  AllotmentSimulator sim;
  sim.addCourse(course(1, 1));
  sim.addStudent(student(1, 1, true, {1}));
  sim.addStudent(student(2, 2, true, {1}));
  CHECK(!sim.runRound2().ok);
  sim.runRound1();
  sim.cancelAdmission(1);
  CHECK(sim.runRound2().ok);
  CHECK(get(sim, 2).status == ALLOCATED && get(sim, 2).round == 2);
}

TEST(verify_next_takes_students_from_the_queue_in_arrival_order) {
  AllotmentSimulator sim;
  sim.addStudent(student(1, 1, false, {}));
  sim.addStudent(student(2, 2, false, {}));
  CHECK(!sim.verifyNext().ok);                   // empty queue
  sim.verificationQueue.enqueue(2);
  sim.verificationQueue.enqueue(1);
  CHECK(sim.verifyNext().ok && get(sim, 2).verified && !get(sim, 1).verified);
  CHECK(sim.verifyNext().ok && get(sim, 1).verified);
  CHECK(!sim.verifyNext().ok);
}

TEST(seats_never_exceed_capacity_for_a_larger_cohort) {
  AllotmentSimulator sim;
  for (int c = 1; c <= 6; ++c) sim.addCourse(course(c, 7));
  unsigned x = 7;
  for (int i = 1; i <= 200; ++i) {
    x = x * 1103515245u + 12345u;
    std::vector<int> prefs;
    for (int k = 0; k < 4; ++k) {
      x = x * 1103515245u + 12345u;
      int c = 1 + static_cast<int>((x >> 16) % 6);
      bool dup = false;
      for (int p : prefs) if (p == c) dup = true;
      if (!dup) prefs.push_back(c);
    }
    sim.addStudent(student(i, 201 - i, true, prefs));
  }
  CHECK(sim.runRound1().ok);
  int allocated = 0;
  for (SimNode* n = sim.head(); n; n = n->next) if (n->data.status == ALLOCATED) allocated++;
  int filled = 0;
  for (const SimCourse& c : sim.courses()) { CHECK(c.filled <= c.seats); filled += c.filled; }
  CHECK(allocated == filled && allocated <= 42);
  // merit order: the first node has the best rank
  CHECK(sim.head()->data.rank == 1);
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
