import emailjs from '@emailjs/browser';
/*
export const sendReservationEmail = async (userEmail, userName, resData, notificationMessage) => {
  try {
    const templateParams = {
      to_email: userEmail,
      to_name: userName || 'User',
      name: userName || 'User',
      time: resData.eventDate || new Date().toLocaleString(),
      event_name: resData.eventName || 'Untitled Event',
      event_date: resData.eventDate || 'TBD',
      message_body: notificationMessage,
      message: notificationMessage
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