// Sorting demo: bubble, selection and insertion sort on percentiles (highest first = merit order).
// The website uses bubble sort to rank students by merit.
// Run:  g++ 06_sorting_demo.cpp -o sorting_demo   then   ./sorting_demo
#include <iostream>
using namespace std;

const int N = 8;

void load(double a[]) {
    double data[N] = {88.5, 99.2, 72.1, 95.7, 81.0, 99.9, 67.4, 90.3};
    for (int i = 0; i < N; i++) a[i] = data[i];
}

void print(double a[]) {
    for (int i = 0; i < N; i++) cout << a[i] << " ";
    cout << endl;
}

void bubbleSort(double a[]) {
    for (int i = 0; i < N - 1; i++)
        for (int j = 0; j < N - 1 - i; j++)
            if (a[j] < a[j + 1]) {
                double t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
}

void selectionSort(double a[]) {
    for (int i = 0; i < N - 1; i++) {
        int best = i;
        for (int j = i + 1; j < N; j++)
            if (a[j] > a[best]) best = j;
        double t = a[i];
        a[i] = a[best];
        a[best] = t;
    }
}

void insertionSort(double a[]) {
    for (int i = 1; i < N; i++) {
        double key = a[i];
        int j = i - 1;
        while (j >= 0 && a[j] < key) {
            a[j + 1] = a[j];
            j--;
        }
        a[j + 1] = key;
    }
}

int main() {
    double a[N];
    int ch;
    do {
        cout << "\n1. Bubble Sort  2. Selection Sort  3. Insertion Sort  4. Exit\n";
        cout << "Enter choice: ";
        cin >> ch;
        if (ch < 1 || ch > 3) continue;

        load(a);
        cout << "Before: ";
        print(a);
        if (ch == 1) bubbleSort(a);
        else if (ch == 2) selectionSort(a);
        else insertionSort(a);
        cout << "After : ";
        print(a);
    } while (ch != 4);

    return 0;
}
