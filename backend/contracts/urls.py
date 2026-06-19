# backend/contracts/urls.py
from django.urls import path
from .views import CurrentUserView, DocumentListCreateView, GoogleLoginView

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google_login'),
    path('auth/me/', CurrentUserView.as_view(), name='current_user'),
    path('contracts/', DocumentListCreateView.as_view(), name='contract_list_create'),
]
