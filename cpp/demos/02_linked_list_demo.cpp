// Linked list demo: traverse, search, insert, delete, sort, join two lists.
// Run:  g++ 02_linked_list_demo.cpp -o linked_list_demo   then   ./linked_list_demo
#include <iostream>
using namespace std;

class Node {
public:
    int data;
    Node *next;

    Node(int d) {
        data = d;
        next = NULL;
    }
};

Node *arrayToList(int arr[], int n) {
    Node *head = new Node(arr[0]);
    Node *mover = head;
    for (int i = 1; i < n; i++) {
        Node *temp = new Node(arr[i]);
        mover->next = temp;
        mover = mover->next;
    }
    return head;
}

void print(Node *temp) {
    cout << "Linked List: ";
    while (temp != NULL) {
        cout << temp->data << " ";
        temp = temp->next;
    }
    cout << endl;
}

int sizeOf(Node *temp) {
    int count = 0;
    while (temp != NULL) {
        count++;
        temp = temp->next;
    }
    return count;
}

int search(Node *temp, int target) {
    int i = 0;
    while (temp != NULL) {
        if (temp->data == target) return i;
        i++;
        temp = temp->next;
    }
    return -1;
}

Node *insertHead(Node *head, int val) {
    Node *temp = new Node(val);
    temp->next = head;
    return temp;
}

Node *deleteKth(Node *head, int k) {
    if (k == 1) {
        Node *temp = head;
        head = head->next;
        delete temp;
        return head;
    }
    Node *temp = head;
    for (int count = 1; count < k - 1; count++) temp = temp->next;
    Node *gone = temp->next;
    temp->next = gone->next;
    delete gone;
    return head;
}

void sortList(Node *head) {
    for (Node *i = head; i != NULL; i = i->next)
        for (Node *j = i->next; j != NULL; j = j->next)
            if (i->data > j->data) {
                int t = i->data;
                i->data = j->data;
                j->data = t;
            }
}

Node *join(Node *a, Node *b) {
    if (a == NULL) return b;
    Node *temp = a;
    while (temp->next != NULL) temp = temp->next;
    temp->next = b;
    return a;
}

int main() {
    int arr1[6] = {18, 45, 7, 10, 8, 93};
    int arr2[4] = {25, 12, 67, 3};
    Node *head = arrayToList(arr1, 6);
    Node *head2 = arrayToList(arr2, 4);

    int ch, target, k, val;
    do {
        cout << "\n1. Print  2. Search  3. Insert at head  4. Delete k-th  5. Sort  6. Join with second list  7. Exit\n";
        cout << "Enter choice: ";
        cin >> ch;

        switch (ch) {
            case 1:
                print(head);
                break;
            case 2:
                cout << "Enter target: ";
                cin >> target;
                if (search(head, target) != -1) cout << target << " found at index " << search(head, target) << endl;
                else cout << target << " not found" << endl;
                break;
            case 3:
                cout << "Enter new value: ";
                cin >> val;
                head = insertHead(head, val);
                print(head);
                break;
            case 4:
                cout << "Enter k: ";
                cin >> k;
                if (k < 1 || k > sizeOf(head)) cout << "Invalid input" << endl;
                else {
                    head = deleteKth(head, k);
                    print(head);
                }
                break;
            case 5:
                sortList(head);
                print(head);
                break;
            case 6:
                head = join(head, head2);
                head2 = NULL;
                print(head);
                break;
            case 7:
                cout << "Exit..." << endl;
                break;
            default:
                cout << "Invalid Input" << endl;
        }
    } while (ch != 7);

    return 0;
}
