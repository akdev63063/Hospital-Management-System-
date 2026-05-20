import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email_handler(event, context):
    """
    AWS Lambda handler triggered by HTTP POST to send emails based on events.
    Triggers:
    - SIGNUP_WELCOME
    - BOOKING_CONFIRMATION
    """
    try:
        # Parse the HTTP body
        body_str = event.get('body', '{}')
        if not body_str:
            body_str = '{}'
        
        # If running via serverless-offline, the body might be a dict already
        if isinstance(body_str, str):
            data = json.loads(body_str)
        else:
            data = body_str

        trigger = data.get('trigger')
        recipient_email = data.get('email')
        
        if not trigger or not recipient_email:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"error": "Missing 'trigger' or 'email' in request body."})
            }

        smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_USER', '')
        smtp_pass = os.environ.get('SMTP_PASSWORD', '')
        sender_email = os.environ.get('SENDER_EMAIL', smtp_user)

        # Subject and email body compilation
        subject = ""
        html_body = ""

        if trigger == "SIGNUP_WELCOME":
            role = data.get('role', 'User')
            name = data.get('name', 'Valued Member')
            subject = "Welcome to Hospital Management System (HMS)!"
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #2b6cb0; border-bottom: 2px solid #2b6cb0; padding-bottom: 10px;">Welcome to HMS!</h2>
                        <p>Hi <strong>{name}</strong>,</p>
                        <p>Thank you for signing up as a <strong>{role.lower()}</strong> in our Hospital Management System.</p>
                        <p>With our modern scheduling portal, you can now:</p>
                        <ul>
                            {"<li>Set and update your flexible daily availability slots</li><li>View your booked patient appointments</li>" if role.upper() == "DOCTOR" else "<li>Find professional doctors by specialties</li><li>Book and manage available scheduling slots instantly</li>"}
                            <li>Enable direct Google Calendar integration to sync appointments automatically</li>
                        </ul>
                        <p>We're excited to help streamline your healthcare scheduling journey.</p>
                        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                        <p style="font-size: 0.85em; color: #777777;">This is an automated notification from the HMS local serverless email service.</p>
                    </div>
                </body>
            </html>
            """
        elif trigger == "BOOKING_CONFIRMATION":
            patient_name = data.get('patient_name', 'Patient')
            doctor_name = data.get('doctor_name', 'Doctor')
            booking_date = data.get('date', 'N/A')
            booking_time = data.get('time', 'N/A')
            
            subject = f"Appointment Confirmed: Dr. {doctor_name}"
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #48bb78; border-bottom: 2px solid #48bb78; padding-bottom: 10px;">Appointment Confirmed!</h2>
                        <p>Dear <strong>{patient_name}</strong>,</p>
                        <p>Your healthcare appointment has been successfully scheduled and locked in the database.</p>
                        <div style="background-color: #f7fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #48bb78; margin: 20px 0;">
                            <p style="margin: 0; font-size: 1.1em;"><strong>Appointment Details:</strong></p>
                            <p style="margin: 5px 0 0 0;">👨‍⚕️ <strong>Doctor:</strong> Dr. {doctor_name}</p>
                            <p style="margin: 5px 0 0 0;">📅 <strong>Date:</strong> {booking_date}</p>
                            <p style="margin: 5px 0 0 0;">⏰ <strong>Time Slot:</strong> {booking_time}</p>
                        </div>
                        <p>A matching event has been synchronized with your Google Calendar if OAuth sync is authorized.</p>
                        <p>If you need to reschedule or cancel, please update your appointment at least 24 hours in advance on the dashboard.</p>
                        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                        <p style="font-size: 0.85em; color: #777777;">This is an automated notification from the HMS local serverless email service.</p>
                    </div>
                </body>
            </html>
            """
        else:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"error": f"Unsupported trigger type: '{trigger}'"})
            }

        # Check for mock sending if credentials aren't completed yet
        if not smtp_user or not smtp_pass:
            # We are in local/mock testing mode if environment secrets are not filled!
            print(f"[MOCK SMTP] Trigger: {trigger} | To: {recipient_email} | Subject: {subject}")
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({
                    "status": "success",
                    "mode": "mock",
                    "message": "Local integration test succeeded. Email log simulated in developer stdout.",
                    "details": {
                        "trigger": trigger,
                        "recipient": recipient_email,
                        "subject": subject
                    }
                })
            }

        # Real SMTP sending process
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = sender_email
        msg['To'] = recipient_email

        part = MIMEText(html_body, 'html')
        msg.attach(part)

        # Connect & send
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(sender_email, [recipient_email], msg.as_string())
        server.quit()

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({
                "status": "success",
                "mode": "production_smtp",
                "message": f"Email triggered by '{trigger}' successfully delivered to {recipient_email}."
            })
        }

    except Exception as e:
        print(f"[ERROR] Email Handler: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"error": f"Internal email serverless error: {str(e)}"})
        }
