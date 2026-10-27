// Stack demo: stack with an array, stack with a linked list, balanced brackets.
// The website uses a stack for "undo": the newest change is on top and is undone first.
// Run:  g++ 03_stack_demo.cpp -o stack_demo   then   ./stack_demo
#include <iostream>
#include <string>
using namespace std;

class ArrayStack {
    int a[100];
    int top;

public:
    ArrayStack() { top = -1; }

    void push(int x) {
        if (top == 99) cout << "Stack Overflow" << endl;
        else a[++top] = x;
    }

    void pop() {
        if (top == -1) cout << "Stack Underflow" << endl;
        else cout << "Popped: " << a[top--] << endl;
    }

    void display() {
        for (int i = top; i >= 0; i--) cout << a[i] << " ";
        cout << endl;
    }
};

class LinkedStack {
    struct Node {
        int data;
        Node *next;
    };
    Node *top;

public:
    LinkedStack() { top = NULL; }

    void push(int x) {
        Node *temp = new Node;
        temp->data = x;
        temp->next = top;
        top = temp;
    }

    void pop() {
        if (top == NULL) {
            cout << "Stack Underflow" << endl;
            return;
        }
        Node *temp = top;
        cout << "Popped: " << top->data << endl;
        top = top->next;
        delete temp;
    }

    void display() {
        Node *temp = top;
        while (temp != NULL) {
            cout << temp->data << " ";
            temp = temp->next;
        }
        cout << endl;
    }
};

bool balanced(string s) {
    char st[100];
    int top = -1;
    for (int i = 0; i < (int)s.size(); i++) {
        char c = s[i];
        if (c == '(' || c == '{' || c == '[') st[++top] = c;
        else if (c == ')' || c == '}' || c == ']') {
            if (top == -1) return false;
            char x = st[top--];
            if (c == ')' && x != '(') return false;
            if (c == '}' && x != '{') return false;
            if (c == ']' && x != '[') return false;
        }
    }
    return top == -1;
}

int main() {
    int ch;
    do {
        cout << "\n1. Array Stack  2. Linked List Stack  3. Balanced Brackets  0. Exit\n";
        cout << "Enter choice: ";
        cin >> ch;

        if (ch == 1 || ch == 2) {
            ArrayStack a;
            LinkedStack l;
            int op, x;
            do {
                cout << "\n1.Push 2.Pop 3.Display 0.Back: ";
                cin >> op;
                if (op == 1) {
                    cin >> x;
                    if (ch == 1) a.push(x);
                    else l.push(x);
                } else if (op == 2) {
                    if (ch == 1) a.pop();
                    else l.pop();
                } else if (op == 3) {
                    if (ch == 1) a.display();
                    else l.display();
                }
            } while (op != 0);
        } else if (ch == 3) {
            string s;
            cout << "Enter expression (no spaces): ";
            cin >> s;
            if (balanced(s)) cout << "Balanced" << endl;
            else cout << "Not Balanced" << endl;
        }
    } while (ch != 0);

    return 0;
}
