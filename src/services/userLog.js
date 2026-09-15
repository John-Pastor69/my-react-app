import { createUserProfile } from "./userServices";
import { getAuth } from "firebase/auth";

export const handleRegistration = async () => {
    const auth = getAuth();
    const user = auth.currentUser()

    if (user) try {
        await createUserProfile(user.id, user.emial, "endorsor");
        console.log("endorsor has logged in");
    } catch (error) {
        console.log("error creating profile", error);
    } else {
        console.log("successfully logged in");
    }
    
}