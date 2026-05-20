import datetime
import os
import requests
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.models import User, Group
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.core.exceptions import ValidationError, PermissionDenied
from django.contrib import messages
from django.conf import settings

# Google Auth/Calendar APIs
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from .models import DoctorProfile, PatientProfile, AvailabilitySlot, AppointmentBooking, UserOAuthToken

# Helper: Trigger Email Notification via Local Serverless endpoint
def trigger_serverless_email(payload):
    url = getattr(settings, 'EMAIL_SERVICE_URL', 'http://localhost:4000/dev/email/send')
    try:
        response = requests.post(url, json=payload, timeout=5)
        print(f"[SERVERLESS TRIG] Email Trigger Sent. Response {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[SERVERLESS TRIG ERROR] Failed to hit email service: {str(e)}")


# ----------------- AUTHENTICATION VIEWS -----------------

def signup_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    if request.method == "POST":
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        role = request.POST.get('role')  # "DOCTOR" or "PATIENT"
        first_name = request.POST.get('first_name', '')
        last_name = request.POST.get('last_name', '')
        
        # Additional fields
        specialty = request.POST.get('specialty', 'General Practitioner')
        dob = request.POST.get('date_of_birth', None)
        phone = request.POST.get('phone', '')

        if not username or not email or not password or not role:
            messages.error(request, "Please enter all required fields.")
            return render(request, 'booking_app/signup.html')

        if User.objects.filter(username=username).exists():
            messages.error(request, "Username already exists.")
            return render(request, 'booking_app/signup.html')

        try:
            with transaction.atomic():
                # Password hashing is done automatically by Django create_user
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name
                )
                
                if role == "DOCTOR":
                    DoctorProfile.objects.create(user=user, specialty=specialty)
                    # Create Doctor group permission if it exists or use simple check
                    group, _ = Group.objects.get_or_create(name='Doctors')
                    user.groups.add(group)
                else:
                    dob_date = datetime.datetime.strptime(dob, "%Y-%m-%d").date() if dob else None
                    PatientProfile.objects.create(user=user, date_of_birth=dob_date, contact_number=phone)
                    group, _ = Group.objects.get_or_create(name='Patients')
                    user.groups.add(group)
                
            # Trigger Serverless SIGNUP_WELCOME Email trigger
            trigger_serverless_email({
                "trigger": "SIGNUP_WELCOME",
                "email": user.email,
                "name": f"{user.first_name} {user.last_name}".strip() or user.username,
                "role": role
            })

            messages.success(request, "Account registered successfully! Please log in.")
            return redirect('login')

        except Exception as e:
            messages.error(request, f"Registration failed: {str(e)}")
            return render(request, 'booking_app/signup.html')

    return render(request, 'booking_app/signup.html')


def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')

    if request.method == "POST":
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, f"Welcome back, {user.username}!")
            return redirect('dashboard')
        else:
            messages.error(request, "Invalid username or password.")

    return render(request, 'booking_app/login.html')


@login_required
def logout_view(request):
    logout(request)
    messages.info(request, "Logged out successfully.")
    return redirect('login')


# ----------------- DASHBOARD & CORE HMS VIEWS -----------------

@login_required
def dashboard_view(request):
    user = request.user
    is_doctor = hasattr(user, 'doctor_profile')
    is_patient = hasattr(user, 'patient_profile')

    if is_doctor:
        # Doctor flow
        my_slots = AvailabilitySlot.objects.filter(doctor=user).order_by('date', 'start_time')
        my_bookings = AppointmentBooking.objects.filter(doctor=user).order_by('slot__date', 'slot__start_time')
        
        context = {
            'is_doctor': True,
            'specialty': user.doctor_profile.specialty,
            'slots': my_slots,
            'bookings': my_bookings,
        }
        return render(request, 'booking_app/doctor_dashboard.html', context)
        
    elif is_patient:
        # Patient flow
        # Get active doctors
        doctors = DoctorProfile.objects.select_related('user').all()
        # View user's own bookings
        my_bookings = AppointmentBooking.objects.filter(patient=user).order_by('slot__date', 'slot__start_time')
        
        # Get slots currently eligible for booking (in future and not yet booked)
        now_date = datetime.date.today()
        available_slots = AvailabilitySlot.objects.filter(
            date__gte=now_date,
            is_booked=False
        ).select_related('doctor', 'doctor__doctor_profile').order_by('date', 'start_time')

        context = {
            'is_patient': True,
            'doctors': doctors,
            'bookings': my_bookings,
            'available_slots': available_slots,
        }
        return render(request, 'booking_app/patient_dashboard.html', context)
    
    else:
        # Fallback for admin or unassigned users
        return render(request, 'booking_app/unassigned_dashboard.html')


@login_required
def create_slot_view(request):
    """
    Allows a Doctor to log and add self availability slots.
    """
    if not hasattr(request.user, 'doctor_profile'):
        raise PermissionDenied("Only doctors can manage availability.")

    if request.method == "POST":
        slot_date_str = request.POST.get('date')
        start_time_str = request.POST.get('start_time')
        end_time_str = request.POST.get('end_time')

        if not slot_date_str or not start_time_str or not end_time_str:
            messages.error(request, "All time fields are required.")
            return redirect('dashboard')

        try:
            slot_date = datetime.datetime.strptime(slot_date_str, "%Y-%m-%d").date()
            start_time = datetime.datetime.strptime(start_time_str, "%H:%M").time()
            end_time = datetime.datetime.strptime(end_time_str, "%H:%M").time()

            if slot_date < datetime.date.today():
                messages.error(request, "Cannot set availability in the past.")
                return redirect('dashboard')

            if start_time >= end_time:
                messages.error(request, "Start time must be strictly before end time.")
                return redirect('dashboard')

            # Create slot
            AvailabilitySlot.objects.create(
                doctor=request.user,
                date=slot_date,
                start_time=start_time,
                end_time=end_time
            )
            messages.success(request, f"Availability slot for {slot_date} {start_time}-{end_time} listed successfully!")
        except Exception as e:
            messages.error(request, f"Failed to list slot: {str(e)}")

    return redirect('dashboard')


@login_required
def book_slot_view(request, slot_id):
    """
    Patient books an available doctor time slot.
    Utilizes transaction lock select_for_update() to prevent concurrent scheduling race condition.
    """
    if not hasattr(request.user, 'patient_profile'):
        raise PermissionDenied("Only patients can book appointments.")

    slot = get_object_or_404(AvailabilitySlot, id=slot_id)

    try:
        # DB Concurrency Race Condition Control Block
        with transaction.atomic():
            # Apply row level SELECT FOR UPDATE lock which halts alternate connections querying this row
            slot_locked = AvailabilitySlot.objects.select_for_update().get(id=slot_id)
            
            # Recheck status inside locked transaction state
            if slot_locked.is_booked:
                messages.error(request, "Race lost! This slot has already been booked by another patient just milliseconds ago.")
                return redirect('dashboard')

            if slot_locked.date < datetime.date.today():
                messages.error(request, "You cannot book slot positions in the past.")
                return redirect('dashboard')

            # Complete checkout and create appointment
            booking = AppointmentBooking.objects.create(
                patient=request.user,
                doctor=slot_locked.doctor,
                slot=slot_locked
            )

            # Block future scheduling triggers on this slot
            slot_locked.is_booked = True
            slot_locked.save()

        # Trigger Serverless confirmation email callback
        p_name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        doc_name = f"{slot_locked.doctor.first_name} {slot_locked.doctor.last_name}".strip() or slot_locked.doctor.username
        trigger_serverless_email({
            "trigger": "BOOKING_CONFIRMATION",
            "email": request.user.email,
            "patient_name": p_name,
            "doctor_name": doc_name,
            "date": str(slot_locked.date),
            "time": f"{slot_locked.start_time.strftime('%H:%M')} - {slot_locked.end_time.strftime('%H:%M')}"
        })

        # Sync google calendar if authorized
        sync_calendar_event(request, booking)

        messages.success(request, f"Success! Appointment with Dr. {doc_name} is created.")

    except Exception as e:
        messages.error(request, f"Booking processing halted. Reason: {str(e)}")

    return redirect('dashboard')


# ----------------- GOOGLE CALENDAR OAUTH2 INTEGRATION -----------------

def get_oauth_flow(request):
    """
    Google OAuth client helper.
    """
    # Assuming standard client secret file path
    client_secrets_path = os.path.join(settings.BASE_DIR, 'client_secret.json')
    scopes = ["https://www.googleapis.com/auth/calendar.events"]
    
    # Simple relative redirect construction
    redirect_uri = request.build_absolute_uri('/oauth2callback/')
    
    flow = Flow.from_client_secrets_file(
        client_secrets_path,
        scopes=scopes,
        redirect_uri=redirect_uri
    )
    return flow


@login_required
def google_calendar_auth_init(request):
    """
    Kicks off Google OAuth login to request calendars modification permission.
    """
    try:
        flow = get_oauth_flow(request)
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true'
        )
        request.session['oauth_state'] = state
        return redirect(authorization_url)
    except Exception as e:
        messages.error(request, f"Failed static OAuth initialization: {str(e)}. Please assure client_secret.json is loaded.")
        return redirect('dashboard')


@login_required
def google_calendar_oauth_callback(request):
    """
    Exchange code for access/refresh tokens and store in UserOAuthToken model.
    """
    state = request.session.get('oauth_state')
    flow = get_oauth_flow(request)
    flow.fetch_token(authorization_response=request.get_full_path())

    credentials = flow.credentials

    # Save details securely in the database
    UserOAuthToken.objects.update_or_create(
        user=request.user,
        defaults={
            'access_token': credentials.token,
            'refresh_token': credentials.refresh_token or '',
            'scopes': ','.join(credentials.scopes),
            'expires_at': datetime.datetime.now() + datetime.timedelta(seconds=credentials.expiry) if credentials.expiry else None
        }
    )
    
    messages.success(request, "Successfully connected with Google Calendar! Future bookings will sync automatically.")
    return redirect('dashboard')


def sync_calendar_event(request, booking):
    """
    Synchronizes the booking on both Doctor and Patient Google Calendars if they are connected.
    """
    for party in [booking.patient, booking.doctor]:
        try:
            token_query = UserOAuthToken.objects.filter(user=party).first()
            if not token_query:
                # This party has not authorized Calendar sync yet, skip silently
                continue

            # Load tokens
            creds = Credentials(
                token=token_query.access_token,
                refresh_token=token_query.refresh_token,
                token_uri=token_query.token_uri,
                client_id=token_query.client_id,
                client_secret=token_query.client_secret,
                scopes=token_query.scopes.split(',') if token_query.scopes else []
            )

            service = build('calendar', 'v3', credentials=creds)

            # Define localized event details
            p_name = f"{booking.patient.first_name} {booking.patient.last_name}".strip() or booking.patient.username
            doc_name = f"{booking.doctor.first_name} {booking.doctor.last_name}".strip() or booking.doctor.username

            title = ""
            if party == booking.patient:
                title = f"Appointment with Dr. {doc_name}"
            else:
                title = f"Appointment with {p_name}"

            # Start & End strings
            date_str = str(booking.slot.date)
            start_iso = f"{date_str}T{booking.slot.start_time.isoformat()}"
            end_iso = f"{date_str}T{booking.slot.end_time.isoformat()}"

            event = {
                'summary': title,
                'description': f'Automated booking confirmed via HMS. Scheduled Slot ID: {booking.slot.id}. Please contact hospital helpline for revisions.',
                'start': {
                    'dateTime': start_iso,
                    'timeZone': 'UTC',
                },
                'end': {
                    'dateTime': end_iso,
                    'timeZone': 'UTC',
                },
                'reminders': {
                    'useDefault': True,
                },
            }

            created_event = service.events().insert(calendarId='primary', body=event).execute()
            print(f"[CALENDAR SYNC SUCCESS] Synced Event ID: {created_event.get('id')} for User: {party.username}")

        except Exception as e:
            print(f"[CALENDAR SYNC FAIL] Mapped event fail for {party.username}: {str(e)}")
