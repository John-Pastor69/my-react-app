import emailjs from '@emailjs/browser';
/*
export const sendReservationEmail = async (userEmail, userName, resData, notificationMessage) => {
  try {
    const templateParams = {
      to_email: userEmail,
      to_name: userName || 'User',
      event_name: resData.eventName || 'Untitled Event', 
      event_date: resData.eventDate || 'TBD',
      message_body: notificationMessage
    };

    await emailjs.send(
      import.meta.env.VITE_EMAILJS_SERVICE_ID,
      import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      templateParams,
      { publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY }
    );
    console.log("Email sent successfully to:", userEmail);
  } catch (error) {
    console.error("Failed to send email:", error);
  }
};
*/

// Change this to true when you actually want to send emails
const SEND_EMAILS = false;

export const sendReservationEmail = async (
    userEmail,
    userName,
    resData,
    notificationMessage
) => {
    try {
        const templateParams = {
            to_email: userEmail,
            to_name: userName || 'User',
            event_name: resData.eventName || 'Untitled Event',
            event_date: resData.eventDate || 'TBD',
            message_body: notificationMessage
        };

        // Temporarily disabled
        if (!SEND_EMAILS) {
            console.log('Email sending is disabled for testing.');
            console.log('Would have sent email to:', userEmail);
            return;
        }

        await emailjs.send(
            import.meta.env.VITE_EMAILJS_SERVICE_ID,
            import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
            templateParams,
            { publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY }
        );

        console.log("Email sent successfully to:", userEmail);
    } catch (error) {
        console.error("Failed to send email:", error);
    }
};