# backend/model_classifier.py
"""
Root convenience entry point in backend directory for evaluating model accuracy.
Usage:
    python model_classifier.py
"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CONTRACTS_DIR = os.path.join(BACKEND_DIR, 'contracts')
if CONTRACTS_DIR not in sys.path:
    sys.path.insert(0, CONTRACTS_DIR)

from train_classifier import evaluate_classifier, train_local_classifier

if __name__ == '__main__':
    if '--train' in sys.argv:
        train_local_classifier()
    else:
        evaluate_classifier()
