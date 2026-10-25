// Allotment simulator - the CAP-style seat allotment logic from "Project (1)" (CET-Allotment).
//
// DEMONSTRATION ONLY. It works on fictional records and fictional seat counts. It is NOT the official
// CET Cell / CAP allotment procedure and its output is never presented as an official result.
//
// Data structures (all written by hand, as in the original project):
//   * a singly linked list of students (SimNode)            -> merit order, searching by id
//   * a linked-list FIFO queue (SimQueue)                   -> verification queue and waiting list
//   * plain arrays for each student's preference list
//   * bubble sort on the linked list                         -> merit order (rank 1 first)
//   * linear search                                          -> find a student / a course by id
//
// The simulator keeps no state between requests: the caller (the Next.js server) loads the records from
// PostgreSQL, the simulator runs the algorithm, and the caller stores the result.
#ifndef ADMITQUEUE_ALLOTMENT_H
#define ADMITQUEUE_ALLOTMENT_H

#include <string>
#include <vector>

namespace admitqueue {

const int MAX_PREF = 10;

const int NOT_ALLOCATED = 0;
const int ALLOCATED = 1;
const int WAITING = 2;
const int FROZEN = 3;
const int CANCELLED = 4;

struct SimStudent {
  long long id = 0;
  std::string name;
  int rank = 0;                 // merit rank, 1 = best
  bool verified = false;
  int pref[MAX_PREF] = {0};     // course ids in order of preference
  int prefCount = 0;
  long long allotment = 0;      // course id, 0 = none
  int prefNo = 0;               // which preference was allotted (1-based), 0 = none
  int status = NOT_ALLOCATED;
  int round = 0;
  std::string remark;
};

struct SimNode {
  SimStudent data;
  SimNode* next;
  explicit SimNode(const SimStudent& s) : data(s), next(nullptr) {}
};

struct SimCourse {
  long long id = 0;
  std::string label;
  int seats = 0;
  int filled = 0;
};

struct SimQueueNode {
  long long studentId;
  SimQueueNode* next;
  explicit SimQueueNode(long long id) : studentId(id), next(nullptr) {}
};

// FIFO queue (linked list). Used for the verification queue and the waiting list.
class SimQueue {
 public:
  SimQueue() : front_(nullptr), rear_(nullptr), count_(0) {}
  ~SimQueue() { clear(); }
  SimQueue(const SimQueue&) = delete;
  SimQueue& operator=(const SimQueue&) = delete;

  void enqueue(long long id);
  long long dequeue();            // -1 when empty
  bool empty() const { return front_ == nullptr; }
  int size() const { return count_; }
  void clear();
  std::vector<long long> toVector() const;

 private:
  SimQueueNode* front_;
  SimQueueNode* rear_;
  int count_;
};

struct SimResult {
  bool ok = true;
  std::string message;
};

class AllotmentSimulator {
 public:
  AllotmentSimulator() : currentRound(0), head_(nullptr), tail_(nullptr), studentCount_(0) {}
  ~AllotmentSimulator();
  AllotmentSimulator(const AllotmentSimulator&) = delete;
  AllotmentSimulator& operator=(const AllotmentSimulator&) = delete;

  void addCourse(const SimCourse& c) { courses_.push_back(c); }
  void addStudent(const SimStudent& s);            // appends to the linked list
  SimNode* searchStudent(long long id);            // linear search

  SimResult verifyNext();                          // dequeue from the verification queue
  SimResult runRound1();
  SimResult runRound2();
  SimResult promoteWaiting();
  SimResult freezeSeat(long long id);
  SimResult cancelAdmission(long long id);

  void sortMerit();                                // bubble sort by rank
  SimQueue verificationQueue;
  SimQueue waitingQueue;
  int currentRound;

  SimNode* head() const { return head_; }
  const std::vector<SimCourse>& courses() const { return courses_; }
  int studentCount() const { return studentCount_; }

 private:
  SimCourse* getCourse(long long id);
  bool seatAvailable(long long courseId);
  std::string courseName(long long courseId);
  void allocateStudent(SimStudent* s, long long courseId, int prefNo, int roundNo, const std::string& remark);
  void releaseSeat(SimStudent* s);
  int tryAllocate(SimStudent* s, int roundNo, const std::string& remark);

  SimNode* head_;
  SimNode* tail_;
  int studentCount_;
  std::vector<SimCourse> courses_;
};

}  // namespace admitqueue

#endif
