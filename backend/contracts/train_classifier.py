# backend/contracts/train_classifier.py
import os
import sys
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BACKEND_DIR, 'preprocessed_clauses.csv')
MODEL_PATH = os.path.join(BACKEND_DIR, 'clause_classifier_model.pkl')

def evaluate_classifier():
    """Evaluate the existing saved classifier model on the 20% test split."""
    if not os.path.exists(DATA_PATH):
        print(f"Error: {DATA_PATH} not found.")
        return None
    if not os.path.exists(MODEL_PATH):
        print(f"Error: {MODEL_PATH} not found. Run training first.")
        return None

    print(f"Loading dataset from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    print(f"Loading trained model from: {MODEL_PATH}")
    model = joblib.load(MODEL_PATH)

    _, X_test, _, y_test = train_test_split(
        df['text'], 
        df['category'], 
        test_size=0.2, 
        random_state=42, 
        stratify=df['category']
    )

    print(f"Evaluating model on {len(X_test)} test clauses across {df['category'].nunique()} classes...\n")
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print("=" * 60)
    print(f"[ACCURACY] Clause Classifier Model Accuracy: {accuracy * 100:.2f}%")
    print("=" * 60)
    print("\nDetailed Classification Report:")
    print(classification_report(y_test, y_pred, digits=4, zero_division=0))
    return accuracy

def train_local_classifier():
    if not os.path.exists(DATA_PATH):
        print(f"Error: {DATA_PATH} not found. Ensure preprocessing completed successfully.")
        return

    print("Loading preprocessed CUAD clause datasets...")
    df = pd.read_csv(DATA_PATH)

    # 1. Split into training and validation splits (80% Train, 20% Evaluation)
    X_train, X_test, y_train, y_test = train_test_split(
        df['text'], 
        df['category'], 
        test_size=0.2, 
        random_state=42, 
        stratify=df['category']
    )

    print(f"Dataset split completed: {len(X_train)} training rows | {len(X_test)} evaluation rows.")

    # 2. Construct our optimal text machine learning pipeline
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(lowercase=True, stop_words='english', max_features=10000, ngram_range=(1, 2))),
        ('clf', LinearSVC(dual=False, C=1.0))
    ])

    print("Training Linear Support Vector Machine on local CPU matrix...")
    pipeline.fit(X_train, y_train)

    # 3. Calculate evaluation performance metrics
    y_pred = pipeline.predict(X_test)
    accuracy = (y_pred == y_test).mean()
    print(f"\n[SUCCESS] Model Training Successful! Validation Accuracy Score: {accuracy * 100:.2f}%\n")

    # 4. Save the compiled model binary straight to disk
    joblib.dump(pipeline, MODEL_PATH)
    print(f"Saved optimized classifier binaries to: {MODEL_PATH}")

if __name__ == '__main__':
    if '--evaluate' in sys.argv or '-e' in sys.argv:
        evaluate_classifier()
    else:
        train_local_classifier()