// Priority queue demo: the most important value always comes out first.
// The website uses one for the priority lane of the service desk.
// Run:  g++ 05_priority_queue_demo.cpp -o priority_queue_demo   then   ./priority_queue_demo
#include <iostream>
using namespace std;

class PriorityQueue {
    int a[10], n, order;  // order 1 = smallest first, order 2 = largest first

public:
    PriorityQueue(int x) {
        n = 0;
        order = x;
    }

    void insert() {
        if (n == 10) {
            cout << "Queue Full" << endl;
            return;
        }
        int x;
        cout << "Enter value: ";
        cin >> x;

        int i = n - 1;
        if (order == 1) {
            while (i >= 0 && a[i] > x) {
                a[i + 1] = a[i];
                i = i - 1;
            }
        } else {
            while (i >= 0 && a[i] < x) {
                a[i + 1] = a[i];
                i = i - 1;
            }
        }
        a[i + 1] = x;
        n = n + 1;
    }

    void remove() {
        if (n == 0) {
            cout << "Queue Empty" << endl;
            return;
        }
        cout << "Deleted: " << a[0] << endl;
        for (int i = 0; i < n - 1; i++) a[i] = a[i + 1];
        n = n - 1;
    }

    void display() {
        if (n == 0) {
            cout << "Queue Empty" << endl;
            return;
        }
        for (int i = 0; i < n; i++) cout << a[i] << " ";
        cout << endl;
    }
};

int main() {
    PriorityQueue p1(1), p2(2);
    int type, ch;

    do {
        cout << "\n1. Ascending Priority Queue  2. Descending Priority Queue  3. Exit\n";
        cout << "Enter choice: ";
        cin >> type;
        if (type < 1 || type > 2) continue;

        do {
            cout << "\n1. Insert  2. Delete  3. Display  4. Back\n";
            cout << "Enter choice: ";
            cin >> ch;
            if (ch == 1) {
                if (type == 1) p1.insert();
                else p2.insert();
            } else if (ch == 2) {
                if (type == 1) p1.remove();
                else p2.remove();
            } else if (ch == 3) {
                if (type == 1) p1.display();
                else p2.display();
            }
        } while (ch != 4);
    } while (type != 3);

    return 0;
}
