# backend/contracts/train_classifier.py
import os
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.pipeline import Pipeline

def train_local_classifier():
    data_path = 'preprocessed_clauses.csv'
    
    if not os.path.exists(data_path):
        print(f"Error: {data_path} not found. Ensure preprocessing completed successfully.")
        return

    print("Loading preprocessed CUAD clause datasets...")
    df = pd.read_csv(data_path)

    # 1. Split into training and validation splits (80% Train, 20% Evaluation)
    # Using 'stratify' ensures our test sets match the exact distribution percentages
    X_train, X_test, y_train, y_test = train_test_split(
        df['text'], 
        df['category'], 
        test_size=0.2, 
        random_state=42, 
        stratify=df['category']
    )

    print(f"Dataset split completed: {len(X_train)} training rows | {len(X_test)} evaluation rows.")

    # 2. Construct our optimal text machine learning pipeline
    # We turn lowercase on, clear English stop words, and extract unigrams and bigrams (ngram_range 1-2)
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(lowercase=True, stop_words='english', max_features=10000, ngram_range=(1, 2))),
        ('clf', LinearSVC(dual=False, C=1.0))
    ])

    print("Training Linear Support Vector Machine on local CPU matrix...")
    pipeline.fit(X_train, y_train)

    # 3. Calculate evaluation performance metrics
    y_pred = pipeline.predict(X_test)
    accuracy = (y_pred == y_test).mean()
    print(f"🚀 Model Training Successful! Validation Accuracy Score: {accuracy * 100:.2f}%")

    # 4. Save the compiled model binary straight to disk for Django to access
    model_output_path = 'clause_classifier_model.pkl'
    joblib.dump(pipeline, model_output_path)
    print(f"Saved optimized classifier binaries to: {model_output_path}")

if __name__ == '__main__':
    train_local_classifier()