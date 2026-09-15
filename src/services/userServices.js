import { db } from '../Firebase'; 
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export const createUserProfile = async (uid, email, assignedRole) => {
  const baseUserProfile = {
    personal_information: {
      first_name: "",
      last_name: "",
      role: assignedRole, 
      department: "",
      email_address: email,
      phone_number: "",
      employee_id: "",
      date_joined: serverTimestamp()
    },
    endorsement_summary: {
      total_endorsed: 0,
      approved: 0,
      pending_review: 0,
      rejected: 0
    }
  };

  const userDocRef = doc(db, "users", uid);
  await setDoc(userDocRef, baseUserProfile);
};