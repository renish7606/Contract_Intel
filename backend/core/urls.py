"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

import traceback
from django.db import connection
from django.contrib.auth.models import User
from contracts.models import Document, ContractClause

def health_check(request):
    details = {}
    try:
        # Check database connection
        connection.ensure_connection()
        details["db_connection"] = "ok"
        
        # Check table columns
        with connection.cursor() as cursor:
            cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='contracts_document'")
            details["columns"] = [row[0] for row in cursor.fetchall()]
            
        # Check applied migrations
        from django.db.migrations.recorder import MigrationRecorder
        applied = MigrationRecorder.Migration.objects.filter(app="contracts")
        details["applied_migrations"] = [f"{m.name} (applied: {m.applied})" for m in applied]

        # Trigger migrate programmatically
        from django.core.management import call_command
        try:
            call_command("migrate", interactive=False)
            details["migration_trigger"] = "success"
        except Exception as mig_err:
            details["migration_trigger"] = f"failed: {mig_err}"

        # Check tables
        details["user_count"] = User.objects.count()
        details["document_count"] = Document.objects.count()
        details["clause_count"] = ContractClause.objects.count()
        
        # Test query
        first_doc = Document.objects.first()
        if first_doc:
            details["first_doc_title"] = first_doc.title
            # Test serialization
            from contracts.serializers import DocumentSerializer
            ser = DocumentSerializer(first_doc)
            # Access data to force evaluation
            _ = ser.data
            details["serializer_test"] = "ok"
        else:
            details["first_doc_title"] = None

    except Exception as e:
        details["status"] = "error"
        details["error"] = str(e)
        details["traceback"] = traceback.format_exc()
        return JsonResponse(details, status=500)
        
    details["status"] = "ok"
    return JsonResponse(details)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('contracts.urls')),
    path('health/', health_check, name='health_check'),
]


