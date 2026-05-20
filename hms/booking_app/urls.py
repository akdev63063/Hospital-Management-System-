from django.urls import path
from . import views

urlpatterns = [
    # Dashboard redirect
    path('', views.dashboard_view, name='home'),
    path('dashboard/', views.dashboard_view, name='dashboard'),
    
    # Auth Routes
    path('signup/', views.signup_view, name='signup'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    
    # Slot Listing & Exclusivity Booking Flow
    path('slots/create/', views.create_slot_view, name='create_slot'),
    path('slots/book/<int:slot_id>/', views.book_slot_view, name='book_slot'),
    
    # Google OAuth Routes
    path('oauth/connect/', views.google_calendar_auth_init, name='google_cal_auth'),
    path('oauth2callback/', views.google_calendar_oauth_callback, name='google_cal_callback'),
]
