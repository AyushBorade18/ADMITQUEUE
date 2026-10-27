// Searching demo: linear search and binary search for a CAP ID number.
// The website uses linear search to find students by CAP ID prefix or name.
// Run:  g++ 07_searching_demo.cpp -o searching_demo   then   ./searching_demo
#include <iostream>
using namespace std;

const int N = 8;
int ids[N] = {100101, 100204, 100330, 100418, 100562, 100671, 100789, 100856};  // already sorted

int linearSearch(int target) {
    for (int i = 0; i < N; i++)
        if (ids[i] == target) return i;
    return -1;
}

int binarySearch(int target) {
    int low = 0, high = N - 1;
    while (low <= high) {
        int mid = (low + high) / 2;
        if (ids[mid] == target) return mid;
        if (ids[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}

int main() {
    int ch, target, index;
    do {
        cout << "\nIDs: ";
        for (int i = 0; i < N; i++) cout << ids[i] << " ";
        cout << "\n1. Linear Search  2. Binary Search  3. Exit\n";
        cout << "Enter choice: ";
        cin >> ch;
        if (ch < 1 || ch > 2) continue;

        cout << "Enter ID to find: ";
        cin >> target;
        if (ch == 1) index = linearSearch(target);
        else index = binarySearch(target);

        if (index == -1) cout << target << " not found" << endl;
        else cout << target << " found at index " << index << endl;
    } while (ch != 3);

    return 0;
}
