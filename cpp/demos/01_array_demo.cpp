// Array demo: a list of merit marks stored in an array.
// Run:  g++ 01_array_demo.cpp -o array_demo   then   ./array_demo
#include <iostream>
using namespace std;

int a[100];
int n = 5;

void display() {
    cout << "Array: ";
    for (int i = 0; i < n; i++) cout << a[i] << " ";
    cout << endl;
}

void insertAt(int pos, int val) {
    if (n == 100 || pos < 0 || pos > n) {
        cout << "Invalid position" << endl;
        return;
    }
    for (int i = n; i > pos; i--) a[i] = a[i - 1];
    a[pos] = val;
    n++;
}

void deleteAt(int pos) {
    if (pos < 0 || pos >= n) {
        cout << "Invalid position" << endl;
        return;
    }
    for (int i = pos; i < n - 1; i++) a[i] = a[i + 1];
    n--;
}

int main() {
    a[0] = 91; a[1] = 78; a[2] = 85; a[3] = 66; a[4] = 99;

    int ch, pos, val;
    do {
        cout << "\n1. Display  2. Insert  3. Delete  4. Largest  5. Exit\n";
        cout << "Enter choice: ";
        cin >> ch;

        switch (ch) {
            case 1:
                display();
                break;
            case 2:
                cout << "Position (0 to " << n << "): ";
                cin >> pos;
                cout << "Value: ";
                cin >> val;
                insertAt(pos, val);
                display();
                break;
            case 3:
                cout << "Position (0 to " << n - 1 << "): ";
                cin >> pos;
                deleteAt(pos);
                display();
                break;
            case 4: {
                int big = a[0];
                for (int i = 1; i < n; i++)
                    if (a[i] > big) big = a[i];
                cout << "Largest: " << big << endl;
                break;
            }
            case 5:
                cout << "Exit..." << endl;
                break;
            default:
                cout << "Invalid Input" << endl;
        }
    } while (ch != 5);

    return 0;
}
