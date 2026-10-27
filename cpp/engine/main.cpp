// AdmitQueue - the small C++ program that the website starts.
//
// Only basic C++ is used here: arrays, a linked list, a stack, a queue, a priority queue,
// bubble sort and linear search. All the other work (login, database, pages) is done in Next.js.
//
// How it is used:
//   the website starts this program, writes some words/numbers to it (cin)
//   and reads the answer lines back (cout).
//
// You can also try it by hand in a terminal:
//   echo health | ./build/engine
//   printf "undo_top 3 11 12 13" | ./build/engine
//
// Build it with:  g++ main.cpp -o ../build/engine        (or run cpp/build.bat / cpp/build.sh)
#include <iostream>
#include <string>
using namespace std;

const int MAX = 5000;

// ------------------------------------------------------------------ Stack (array)
class Stack {
    int a[MAX];
    int top;

public:
    Stack() { top = -1; }

    void push(int x) {
        if (top < MAX - 1) a[++top] = x;
    }

    int pop() {
        if (top == -1) return 0;
        return a[top--];
    }

    bool empty() { return top == -1; }
};

// ------------------------------------------------------------------ Queue (linked list)
struct Node {
    int data;
    Node *next;
    Node(int x) {
        data = x;
        next = NULL;
    }
};

class Queue {
    Node *front;
    Node *rear;

public:
    Queue() { front = rear = NULL; }

    void enqueue(int x) {
        Node *temp = new Node(x);
        if (front == NULL) front = rear = temp;
        else {
            rear->next = temp;
            rear = temp;
        }
    }

    int dequeue() {
        if (front == NULL) return 0;
        Node *temp = front;
        int x = temp->data;
        front = front->next;
        if (front == NULL) rear = NULL;
        delete temp;
        return x;
    }

    bool empty() { return front == NULL; }
};

// ------------------------------------------------------------------ Priority queue (sorted array)
// smaller level = more important. Same level: smaller seq (came earlier) goes first.
class PriorityQueue {
    int level[MAX];
    int seq[MAX];
    int n;

public:
    PriorityQueue() { n = 0; }

    void insert(int lv, int sq) {
        if (n == MAX) return;
        int i = n - 1;
        while (i >= 0 && (level[i] > lv || (level[i] == lv && seq[i] > sq))) {
            level[i + 1] = level[i];
            seq[i + 1] = seq[i];
            i--;
        }
        level[i + 1] = lv;
        seq[i + 1] = sq;
        n++;
    }

    int remove() {
        if (n == 0) return 0;
        int x = seq[0];
        for (int i = 0; i < n - 1; i++) {
            level[i] = level[i + 1];
            seq[i] = seq[i + 1];
        }
        n--;
        return x;
    }

    bool empty() { return n == 0; }
};

// ------------------------------------------------------------------ health
void health() {
    // tiny self check: stack must give back the last value, bubble sort must order 3 numbers
    Stack s;
    s.push(1);
    s.push(2);
    int top = s.pop();

    int a[3] = {3, 1, 2};
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 2 - i; j++)
            if (a[j] > a[j + 1]) {
                int t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }

    bool ok = (top == 2 && a[0] == 1 && a[1] == 2 && a[2] == 3);
    cout << "ENGINE simple-cpp" << endl;
    cout << "SELFCHECK " << (ok ? 1 : 0) << endl;
}

// ------------------------------------------------------------------ search (linear search)
// input : search <prefix|name> <query> <n>   then n lines:  <id> <name>
// output: STATS <comparisons> <n>   and one  MATCH <index>  per hit
string ids[MAX];
string names[MAX];

void searchStudents() {
    string mode, query;
    int n;
    cin >> mode >> query >> n;
    if (n < 0 || n > MAX) {
        cout << "ERROR too_many" << endl;
        return;
    }
    for (int i = 0; i < n; i++) cin >> ids[i] >> names[i];

    int comparisons = 0;
    int found[MAX];
    int count = 0;
    for (int i = 0; i < n; i++) {
        comparisons++;
        bool hit;
        if (mode == "prefix") hit = ids[i].compare(0, query.size(), query) == 0;
        else hit = names[i].find(query) != string::npos;
        if (hit) found[count++] = i;
    }
    cout << "STATS " << comparisons << " " << n << endl;
    for (int i = 0; i < count; i++) cout << "MATCH " << found[i] << endl;
}

// ------------------------------------------------------------------ import check (linear search)
// input : import_check <e> <e ids...> <m> <m ids...>
// output: one line per new id:  new | duplicate_in_file | already_exists
string oldIds[MAX * 4];
string newIds[MAX];

void importCheck() {
    int e, m;
    cin >> e;
    if (e < 0 || e > MAX * 4) {
        cout << "ERROR too_many" << endl;
        return;
    }
    for (int i = 0; i < e; i++) cin >> oldIds[i];
    cin >> m;
    if (m < 0 || m > MAX) {
        cout << "ERROR too_many" << endl;
        return;
    }
    for (int i = 0; i < m; i++) cin >> newIds[i];

    for (int i = 0; i < m; i++) {
        bool exists = false;
        for (int j = 0; j < e; j++)
            if (oldIds[j] == newIds[i]) {
                exists = true;
                break;
            }
        bool again = false;
        for (int j = 0; j < i; j++)
            if (newIds[j] == newIds[i]) {
                again = true;
                break;
            }
        if (exists) cout << "already_exists" << endl;
        else if (again) cout << "duplicate_in_file" << endl;
        else cout << "new" << endl;
    }
}

// ------------------------------------------------------------------ sort (bubble sort, highest score first)
// input : sort_desc <n> then n lines:  <id> <score>
// output: the ids, best score first (equal scores keep their input order)
int sortId[MAX];
double sortScore[MAX];

void sortDesc() {
    int n;
    cin >> n;
    if (n < 0 || n > MAX) {
        cout << "ERROR too_many" << endl;
        return;
    }
    for (int i = 0; i < n; i++) cin >> sortId[i] >> sortScore[i];

    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (sortScore[j] < sortScore[j + 1]) {
                double ts = sortScore[j];
                sortScore[j] = sortScore[j + 1];
                sortScore[j + 1] = ts;
                int ti = sortId[j];
                sortId[j] = sortId[j + 1];
                sortId[j + 1] = ti;
            }
        }
    }
    for (int i = 0; i < n; i++) cout << "ID " << sortId[i] << endl;
}

// ------------------------------------------------------------------ undo (stack)
// input : undo_top <n> then n action ids, oldest first
// output: TOP <id>  (the newest one, 0 when there is none)
void undoTop() {
    int n;
    cin >> n;
    if (n < 0 || n > MAX) {
        cout << "ERROR too_many" << endl;
        return;
    }
    Stack s;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        s.push(x);
    }
    cout << "TOP " << s.pop() << endl;
}

// ------------------------------------------------------------------ service desk (queue + priority queue)
// input : next_call <fairness> <streak> <n> then n lines:  <seq> <level>
//         level 1 and 2 = priority lane, level 3 = regular lane
// rule  : priority first, but after <fairness> priority calls in a row one regular student is called.
// output: NEXT <seq> <new streak>   (seq 0 = nobody is waiting)
void nextCall() {
    int fairness, streak, n;
    cin >> fairness >> streak >> n;
    if (n < 0 || n > MAX) {
        cout << "ERROR too_many" << endl;
        return;
    }
    PriorityQueue priority;
    Queue regular;
    // the website sends the tokens in arrival order, so the regular lane stays first-come-first-served
    for (int i = 0; i < n; i++) {
        int seq, level;
        cin >> seq >> level;
        if (level >= 3) regular.enqueue(seq);
        else priority.insert(level, seq);
    }

    int chosen = 0;
    if (!priority.empty() && !(streak >= fairness && !regular.empty())) {
        chosen = priority.remove();
        streak++;
    } else if (!regular.empty()) {
        chosen = regular.dequeue();
        streak = 0;
    }
    cout << "NEXT " << chosen << " " << streak << endl;
}

// ------------------------------------------------------------------ allotment (arrays + queue + bubble sort)
// input : allot <round> <c> then c lines:  <id> <seats> <filled>
//               <s> then s lines:  <id> <rank> <status> <allotted course id> <pref no> <verified> <np> <np course ids>
//         status: 0 not allotted, 1 allotted, 2 waiting, 3 frozen, 4 cancelled
// idea  : go through the students from rank 1 downwards. Each student gets the first course on the
//         list that still has a free seat. In round 2 an allotted student may only move UP the list.
// output: STUDENT <id> <status> <course id> <pref no>   COURSE <id> <filled> <seats>   WAIT <id>
struct Student {
    int id, rank, status, course, prefNo, verified, np;
    int prefs[30];
};
Student st[MAX];
int cId[300], cSeats[300], cFilled[300];
int c;

int courseIndex(int id) {
    for (int i = 0; i < c; i++)
        if (cId[i] == id) return i;
    return -1;
}

void allot() {
    int round, s;
    cin >> round >> c;
    if (c < 0 || c > 300) {
        cout << "ERROR too_many_courses" << endl;
        return;
    }
    for (int i = 0; i < c; i++) cin >> cId[i] >> cSeats[i] >> cFilled[i];
    cin >> s;
    if (s < 0 || s > MAX) {
        cout << "ERROR too_many" << endl;
        return;
    }
    for (int i = 0; i < s; i++) {
        cin >> st[i].id >> st[i].rank >> st[i].status >> st[i].course >> st[i].prefNo >> st[i].verified >> st[i].np;
        if (st[i].np < 0 || st[i].np > 30) {
            cout << "ERROR too_many_preferences" << endl;
            return;
        }
        for (int p = 0; p < st[i].np; p++) cin >> st[i].prefs[p];
    }

    // bubble sort: order[] holds the students by rank (rank 1 first)
    int order[MAX];
    for (int i = 0; i < s; i++) order[i] = i;
    for (int i = 0; i < s - 1; i++) {
        for (int j = 0; j < s - 1 - i; j++) {
            if (st[order[j]].rank > st[order[j + 1]].rank) {
                int t = order[j];
                order[j] = order[j + 1];
                order[j + 1] = t;
            }
        }
    }

    Queue waiting;
    for (int k = 0; k < s; k++) {
        Student &x = st[order[k]];
        if (x.status == 3 || x.status == 4) continue;  // frozen or cancelled: never touched
        if (!x.verified) continue;                     // documents not verified yet: no allotment

        int limit = x.np;
        if (x.status == 1) limit = x.prefNo - 1;       // already allotted: only look at better choices

        int got = -1;
        int gotCourse = -1;
        for (int p = 0; p < limit; p++) {
            int ci = courseIndex(x.prefs[p]);
            if (ci >= 0 && cFilled[ci] < cSeats[ci]) {
                got = p;
                gotCourse = ci;
                break;
            }
        }

        if (got >= 0) {
            if (x.status == 1) {
                int old = courseIndex(x.course);
                if (old >= 0) cFilled[old]--;          // the old seat becomes free again
            }
            cFilled[gotCourse]++;
            x.status = 1;
            x.course = x.prefs[got];
            x.prefNo = got + 1;
        } else if (x.status != 1) {
            x.status = 2;
            x.course = 0;
            x.prefNo = 0;
            waiting.enqueue(x.id);
        }
    }

    for (int i = 0; i < s; i++) cout << "STUDENT " << st[i].id << " " << st[i].status << " " << st[i].course << " " << st[i].prefNo << endl;
    for (int i = 0; i < c; i++) cout << "COURSE " << cId[i] << " " << cFilled[i] << " " << cSeats[i] << endl;
    while (!waiting.empty()) cout << "WAIT " << waiting.dequeue() << endl;
}

// ------------------------------------------------------------------ appointment load (2D array)
// input : load <rows> <cols> <from> <to> <b> then b lines:  <row> <col>
// output: ROWSUM <row> <bookings>   BEST <row> <col> <bookings> (3 quietest slots)   BOOKED <cells used>
int grid[40][100];

void appointmentLoad() {
    int rows, cols, from, to, b;
    cin >> rows >> cols >> from >> to >> b;
    if (rows < 1 || rows > 40 || cols < 1 || cols > 100 || from < 0 || to >= cols || from > to) {
        cout << "ERROR bad_size" << endl;
        return;
    }
    for (int r = 0; r < rows; r++)
        for (int k = 0; k < cols; k++) grid[r][k] = 0;
    for (int i = 0; i < b; i++) {
        int r, k;
        cin >> r >> k;
        if (r >= 0 && r < rows && k >= 0 && k < cols) grid[r][k]++;
    }

    int used = 0;
    for (int r = 0; r < rows; r++) {
        int sum = 0;
        for (int k = 0; k < cols; k++) {
            sum += grid[r][k];
            if (grid[r][k] > 0) used++;
        }
        cout << "ROWSUM " << r << " " << sum << endl;
    }

    // 3 quietest slots inside the opening hours (first row/slot wins a tie)
    bool taken[40][100] = {};
    for (int round = 0; round < 3; round++) {
        int br = -1, bk = -1;
        for (int r = 0; r < rows; r++)
            for (int k = from; k <= to; k++)
                if (!taken[r][k] && (br == -1 || grid[r][k] < grid[br][bk])) {
                    br = r;
                    bk = k;
                }
        if (br == -1) break;
        taken[br][bk] = true;
        cout << "BEST " << br << " " << bk << " " << grid[br][bk] << endl;
    }
    cout << "BOOKED " << used << endl;
}

// ------------------------------------------------------------------ document readiness (2D array)
// input : readiness <docs> <rounds> then <rounds> totals, <k> then k lines:  <doc> <round> <count>
// output: PCT <doc> <round> <percent>   WEAKEST <doc>
int cnt[40][12];

void readiness() {
    int docs, rounds, k;
    cin >> docs >> rounds;
    if (docs < 1 || docs > 40 || rounds < 1 || rounds > 12) {
        cout << "ERROR bad_size" << endl;
        return;
    }
    int total[12];
    for (int r = 0; r < rounds; r++) cin >> total[r];
    for (int d = 0; d < docs; d++)
        for (int r = 0; r < rounds; r++) cnt[d][r] = 0;
    cin >> k;
    for (int i = 0; i < k; i++) {
        int d, r, n;
        cin >> d >> r >> n;
        if (d >= 0 && d < docs && r >= 0 && r < rounds) cnt[d][r] += n;
    }

    int weakest = 0;
    int weakestSum = -1;
    for (int d = 0; d < docs; d++) {
        int sum = 0;
        for (int r = 0; r < rounds; r++) {
            sum += cnt[d][r];
            int percent = 0;
            if (total[r] > 0) percent = cnt[d][r] * 100 / total[r];
            if (percent > 100) percent = 100;
            cout << "PCT " << d << " " << r << " " << percent << endl;
        }
        if (weakestSum == -1 || sum < weakestSum) {
            weakestSum = sum;
            weakest = d;
        }
    }
    cout << "WEAKEST " << weakest << endl;
}

// ------------------------------------------------------------------ main
int main() {
    string op;
    if (!(cin >> op)) {
        cout << "ERROR no_input" << endl;
        return 1;
    }
    if (op == "health") health();
    else if (op == "search") searchStudents();
    else if (op == "import_check") importCheck();
    else if (op == "sort_desc") sortDesc();
    else if (op == "undo_top") undoTop();
    else if (op == "next_call") nextCall();
    else if (op == "allot") allot();
    else if (op == "load") appointmentLoad();
    else if (op == "readiness") readiness();
    else {
        cout << "ERROR unknown_op " << op << endl;
        return 2;
    }
    return 0;
}
