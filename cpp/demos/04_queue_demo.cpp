// Queue demo: simple queue, circular queue, linked queue (first in, first out).
// The website uses a queue for the regular lane of the service desk.
// Run:  g++ 04_queue_demo.cpp -o queue_demo   then   ./queue_demo
#include <iostream>
using namespace std;

class SimpleQueue {
    int a[5], front, rear;

public:
    SimpleQueue() {
        front = 0;
        rear = -1;
    }

    void enqueue(int x) {
        if (rear == 4) {
            cout << "Queue Full" << endl;
            return;
        }
        a[++rear] = x;
    }

    void dequeue() {
        if (front > rear) {
            cout << "Queue Empty" << endl;
            return;
        }
        cout << "Deleted: " << a[front++] << endl;
    }

    void display() {
        if (front > rear) {
            cout << "Queue Empty" << endl;
            return;
        }
        for (int i = front; i <= rear; i++) cout << a[i] << " ";
        cout << endl;
    }
};

class CircularQueue {
    int a[5], front, rear;

public:
    CircularQueue() {
        front = -1;
        rear = -1;
    }

    void enqueue(int x) {
        if ((rear + 1) % 5 == front) {
            cout << "Queue Full" << endl;
            return;
        }
        if (front == -1) front = 0;
        rear = (rear + 1) % 5;
        a[rear] = x;
    }

    void dequeue() {
        if (front == -1) {
            cout << "Queue Empty" << endl;
            return;
        }
        cout << "Deleted: " << a[front] << endl;
        if (front == rear) front = rear = -1;
        else front = (front + 1) % 5;
    }

    void display() {
        if (front == -1) {
            cout << "Queue Empty" << endl;
            return;
        }
        int i = front;
        while (true) {
            cout << a[i] << " ";
            if (i == rear) break;
            i = (i + 1) % 5;
        }
        cout << endl;
    }
};

struct Node {
    int data;
    Node *next;

    Node(int x) {
        data = x;
        next = NULL;
    }
};

class LinkedQueue {
    Node *front, *rear;

public:
    LinkedQueue() { front = rear = NULL; }

    void enqueue(int x) {
        Node *temp = new Node(x);
        if (front == NULL) front = rear = temp;
        else {
            rear->next = temp;
            rear = temp;
        }
    }

    void dequeue() {
        if (front == NULL) {
            cout << "Queue Empty" << endl;
            return;
        }
        Node *temp = front;
        cout << "Deleted: " << temp->data << endl;
        front = front->next;
        if (front == NULL) rear = NULL;
        delete temp;
    }

    void display() {
        if (front == NULL) {
            cout << "Queue Empty" << endl;
            return;
        }
        Node *temp = front;
        while (temp != NULL) {
            cout << temp->data << " ";
            temp = temp->next;
        }
        cout << endl;
    }
};

int main() {
    SimpleQueue q;
    CircularQueue cq;
    LinkedQueue lq;
    int type, ch, x;

    do {
        cout << "\n1.Simple Queue  2.Circular Queue  3.Linked Queue  4.Exit\n";
        cout << "Choose queue: ";
        cin >> type;
        if (type < 1 || type > 3) continue;

        do {
            cout << "\n1.Enqueue  2.Dequeue  3.Display  4.Back\n";
            cout << "Enter choice: ";
            cin >> ch;
            if (ch == 1) {
                cout << "Enter value: ";
                cin >> x;
                if (type == 1) q.enqueue(x);
                else if (type == 2) cq.enqueue(x);
                else lq.enqueue(x);
            } else if (ch == 2) {
                if (type == 1) q.dequeue();
                else if (type == 2) cq.dequeue();
                else lq.dequeue();
            } else if (ch == 3) {
                if (type == 1) q.display();
                else if (type == 2) cq.display();
                else lq.display();
            }
        } while (ch != 4);
    } while (type != 4);

    return 0;
}
