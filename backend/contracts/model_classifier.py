# backend/contracts/model_classifier.py
"""
Convenience entry point for evaluating or inspecting the ContractIntel Clause Classifier model.
Can be executed directly from any directory:
    python contracts/model_classifier.py
or
    python model_classifier.py
"""
import os
import sys

# Ensure backend/contracts directory is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from train_classifier import evaluate_classifier, train_local_classifier

if __name__ == '__main__':
    if '--train' in sys.argv:
        train_local_classifier()
    else:
        evaluate_classifier()
