from django.db import models
from django.contrib.auth.models import User

class DoctorProfile(models.Model):
    """
    Extends Django's built-in User with doctor-specific properties.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='doctor_profile')
    specialty = models.CharField(max_length=150, help_text="Medical specialty (e.g., Cardiology, Pediatrics)")
    license_number = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"Dr. {self.user.get_full_name() or self.user.username} - {self.specialty}"


class PatientProfile(models.Model):
    """
    Extends Django's built-in User with patient-specific properties.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='patient_profile')
    date_of_birth = models.DateField(blank=True, null=True)
    contact_number = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return f"Patient: {self.user.get_full_name() or self.user.username}"


class AvailabilitySlot(models.Model):
    """
    Availability time slots set by Doctors.
    """
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='availability_slots')
    date = models.DateField(help_text="Target slot date")
    start_time = models.TimeField(help_text="Format: HH:MM (e.g., 10:00)")
    end_time = models.TimeField(help_text="Format: HH:MM (e.g., 10:30)")
    is_booked = models.BooleanField(default=False, help_text="True if a patient has booked this exact slot")

    class Meta:
        ordering = ['date', 'start_time']
        # Enforce that a doctor cannot create duplicate overlapping exact slots
        unique_together = ('doctor', 'date', 'start_time', 'end_time')

    def __str__(self):
        return f"Slot with Dr. {self.doctor.username} on {self.date} @ {self.start_time}-{self.end_time}"


class AppointmentBooking(models.Model):
    """
    Record of a confirmed appointment session booking.
    """
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='appointments_booked')
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_appointments')
    slot = models.OneToOneField(AvailabilitySlot, on_delete=models.CASCADE, related_name='appointment_booking')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Appt: {self.patient.username} with Dr. {self.doctor.username} on {self.slot.date}"


class UserOAuthToken(models.Model):
    """
    Saves Google OAuth2 flow credentials/tokens for user-level Calendar api syncing.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='oauth_token')
    access_token = models.TextField()
    refresh_token = models.TextField(blank=True, null=True)
    token_uri = models.TextField(default="https://oauth2.googleapis.com/token")
    client_id = models.TextField(blank=True, null=True)
    client_secret = models.TextField(blank=True, null=True)
    scopes = models.TextField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"OAuth Tokens for {self.user.username}"
