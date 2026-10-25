// Allotment simulator implementation. See include/allotment.h.
// The logic is the one from Project (1) / CET-Allotment/backend/main.cpp, moved into a class so that it has no
// global variables and can be created fresh for every request.
#include "allotment.h"

namespace admitqueue {

// ---------------------------------------------------------------- SimQueue (linked-list FIFO queue)

void SimQueue::enqueue(long long id) {
  SimQueueNode* temp = new SimQueueNode(id);
  if (rear_ == nullptr) {
    front_ = rear_ = temp;
  } else {
    rear_->next = temp;
    rear_ = temp;
  }
  count_++;
}

long long SimQueue::dequeue() {
  if (front_ == nullptr) return -1;
  SimQueueNode* temp = front_;
  long long id = temp->studentId;
  front_ = front_->next;
  if (front_ == nullptr) rear_ = nullptr;
  delete temp;
  count_--;
  return id;
}

void SimQueue::clear() {
  while (front_ != nullptr) dequeue();
}

std::vector<long long> SimQueue::toVector() const {
  std::vector<long long> out;
  for (SimQueueNode* n = front_; n != nullptr; n = n->next) out.push_back(n->studentId);
  return out;
}

// ---------------------------------------------------------------- AllotmentSimulator

AllotmentSimulator::~AllotmentSimulator() {
  while (head_ != nullptr) {
    SimNode* next = head_->next;
    delete head_;
    head_ = next;
  }
}

void AllotmentSimulator::addStudent(const SimStudent& s) {
  SimNode* temp = new SimNode(s);
  if (head_ == nullptr) {
    head_ = tail_ = temp;
  } else {
    tail_->next = temp;
    tail_ = temp;
  }
  studentCount_++;
}

SimNode* AllotmentSimulator::searchStudent(long long id) {
  for (SimNode* temp = head_; temp != nullptr; temp = temp->next) {
    if (temp->data.id == id) return temp;
  }
  return nullptr;
}

// Bubble sort on the linked list (swaps the data of neighbouring nodes). Equal ranks keep their order.
void AllotmentSimulator::sortMerit() {
  if (head_ == nullptr) return;
  for (int i = 0; i < studentCount_ - 1; i++) {
    SimNode* current = head_;
    for (int j = 0; j < studentCount_ - i - 1; j++) {
      if (current->data.rank > current->next->data.rank) {
        SimStudent temp = current->data;
        current->data = current->next->data;
        current->next->data = temp;
      }
      current = current->next;
    }
  }
}

SimCourse* AllotmentSimulator::getCourse(long long id) {
  for (std::size_t i = 0; i < courses_.size(); i++) {
    if (courses_[i].id == id) return &courses_[i];
  }
  return nullptr;
}

bool AllotmentSimulator::seatAvailable(long long courseId) {
  SimCourse* course = getCourse(courseId);
  if (course == nullptr) return false;
  return course->filled < course->seats;
}

std::string AllotmentSimulator::courseName(long long courseId) {
  SimCourse* course = getCourse(courseId);
  if (course == nullptr) return "Unknown";
  return course->label;
}

void AllotmentSimulator::allocateStudent(SimStudent* s, long long courseId, int prefNo, int roundNo,
                                         const std::string& remark) {
  SimCourse* course = getCourse(courseId);
  course->filled++;
  s->allotment = courseId;
  s->prefNo = prefNo;
  s->round = roundNo;
  s->status = ALLOCATED;
  s->remark = remark;
}

void AllotmentSimulator::releaseSeat(SimStudent* s) {
  SimCourse* course = getCourse(s->allotment);
  if (course != nullptr) course->filled--;
  s->allotment = 0;
  s->prefNo = 0;
}

int AllotmentSimulator::tryAllocate(SimStudent* s, int roundNo, const std::string& remark) {
  for (int i = 0; i < s->prefCount; i++) {
    long long choice = s->pref[i];
    if (seatAvailable(choice)) {
      allocateStudent(s, choice, i + 1, roundNo, remark);
      return i + 1;
    }
  }
  return 0;
}

SimResult AllotmentSimulator::verifyNext() {
  if (verificationQueue.empty()) return {false, "Verification queue is empty"};
  long long id = verificationQueue.dequeue();
  SimNode* node = searchStudent(id);
  if (node == nullptr) return {false, "Student not found"};
  node->data.verified = true;
  return {true, "Verified student " + std::to_string(id) + " (" + node->data.name + ")"};
}

SimResult AllotmentSimulator::runRound1() {
  if (currentRound != 0) return {false, "Round 1 is already done"};
  sortMerit();
  int allocated = 0, waiting = 0, skipped = 0;
  for (SimNode* temp = head_; temp != nullptr; temp = temp->next) {
    SimStudent* s = &temp->data;
    if (!s->verified || s->prefCount == 0) {
      skipped++;
    } else {
      int p = tryAllocate(s, 1, "Simulated Round 1 allotment");
      if (p > 0) {
        allocated++;
      } else {
        s->status = WAITING;
        s->remark = "No seat in any preference";
        waitingQueue.enqueue(s->id);
        waiting++;
      }
    }
  }
  currentRound = 1;
  return {true, "Round 1 done. Allocated: " + std::to_string(allocated) + ", Waiting: " + std::to_string(waiting) +
                    ", Not verified or no preferences (skipped): " + std::to_string(skipped)};
}

SimResult AllotmentSimulator::freezeSeat(long long id) {
  SimNode* node = searchStudent(id);
  if (node == nullptr) return {false, "Student not found"};
  if (node->data.status != ALLOCATED) return {false, "Only an allocated seat can be frozen"};
  node->data.status = FROZEN;
  node->data.remark = "Seat frozen by student";
  return {true, "Seat frozen for " + node->data.name};
}

SimResult AllotmentSimulator::cancelAdmission(long long id) {
  SimNode* node = searchStudent(id);
  if (node == nullptr) return {false, "Student not found"};
  SimStudent* s = &node->data;
  if (s->status != ALLOCATED && s->status != FROZEN) return {false, "This student has no admission to cancel"};
  std::string where = courseName(s->allotment);
  releaseSeat(s);
  s->status = CANCELLED;
  s->remark = "Admission cancelled, seat released";
  return {true, "Admission cancelled for " + s->name + ". Vacant seat: " + where};
}

SimResult AllotmentSimulator::promoteWaiting() {
  if (currentRound == 0) return {false, "Run Round 1 first"};
  if (waitingQueue.empty()) return {false, "Waiting list is empty"};
  int total = waitingQueue.size();
  bool promoted = false;
  std::string message;
  for (int i = 0; i < total; i++) {
    long long id = waitingQueue.dequeue();
    SimNode* node = searchStudent(id);
    if (node == nullptr) continue;
    SimStudent* s = &node->data;
    if (!promoted) {
      int p = tryAllocate(s, currentRound, "Promoted from waiting list");
      if (p > 0) {
        promoted = true;
        message = "Promoted " + s->name + " to " + courseName(s->allotment) + " (preference " + std::to_string(p) + ")";
        continue;
      }
    }
    waitingQueue.enqueue(id);
  }
  if (!promoted) return {false, "No waiting student has a vacant seat in the preferences"};
  return {true, message};
}

SimResult AllotmentSimulator::runRound2() {
  if (currentRound == 0) return {false, "Run Round 1 first"};
  if (currentRound >= 2) return {false, "Round 2 is already done"};
  sortMerit();
  waitingQueue.clear();
  int better = 0, fresh = 0, waiting = 0;
  for (SimNode* temp = head_; temp != nullptr; temp = temp->next) {
    SimStudent* s = &temp->data;
    if (s->verified && s->prefCount > 0) {
      if (s->status == ALLOCATED) {
        for (int i = 0; i < s->prefNo - 1; i++) {
          long long choice = s->pref[i];
          if (seatAvailable(choice)) {
            int oldPref = s->prefNo;
            releaseSeat(s);
            allocateStudent(s, choice, i + 1, 2,
                            "Betterment: moved from preference " + std::to_string(oldPref) + " to " + std::to_string(i + 1));
            better++;
            break;
          }
        }
      } else if (s->status == WAITING || s->status == NOT_ALLOCATED) {
        int p = tryAllocate(s, 2, "Simulated Round 2 allotment");
        if (p > 0) {
          fresh++;
        } else {
          s->status = WAITING;
          s->remark = "No seat in any preference";
          waitingQueue.enqueue(s->id);
          waiting++;
        }
      }
    }
  }
  currentRound = 2;
  return {true, "Round 2 done. Betterment: " + std::to_string(better) + ", New seats: " + std::to_string(fresh) +
                    ", Still waiting: " + std::to_string(waiting)};
}

}  // namespace admitqueue
