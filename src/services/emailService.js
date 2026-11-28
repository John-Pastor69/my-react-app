import emailjs from '@emailjs/browser';

const EMAILJS_ENABLED = false; // Flip to true when ready to send emails
const STORAGE_KEY = 'emailjs_disabled_month';
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

let quotaAvailable = localStorage.getItem(STORAGE_KEY) !== getCurrentMonth();

export const sendReservationEmail = async (
  userEmail,
  userName,
  resData,
  notificationMessage
) => {
  if (!EMAILJS_ENABLED || !quotaAvailable) {
    return { success: false, skipped: true };
  }

  try {
    const templateParams = {
      to_email: userEmail,
      to_name: userName || 'User',
      event_name: resData.eventName || 'Untitled Event',
      event_date: resData.eventDate || 'TBD',
      message_body: notificationMessage,
    };

    await emailjs.send(
      import.meta.env.VITE_EMAILJS_SERVICE_ID,
      import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      templateParams,
      { publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY }
    );

    console.log('Email sent successfully to:', userEmail);
    return { success: true };
  } catch (error) {
    const isQuotaError =
      error?.status === 429 ||
      error?.status === 402 ||
      /limit|quota/i.test(error?.text || '');

    if (isQuotaError) {
      quotaAvailable = false;
      localStorage.setItem(STORAGE_KEY, getCurrentMonth());
      console.warn('EmailJS monthly limit reached. Disabled until next month.');
    } else {
      console.error('Failed to send email:', error);
    }

    return { success: false };
  }
};