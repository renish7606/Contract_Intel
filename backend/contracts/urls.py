# backend/contracts/urls.py
from django.urls import path
from .views import GoogleLoginView, DocumentListCreateView

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google_login'),
    path('contracts/', DocumentListCreateView.as_view(), name='contract_list_create'),
]