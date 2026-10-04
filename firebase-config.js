import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyBMYnuPNJP9ednD2XRZBC1ZL53lGWoLmAw",
    authDomain: "campus-complaint-portal-ccac7.firebaseapp.com",
    projectId: "campus-complaint-portal-ccac7",
    storageBucket: "campus-complaint-portal-ccac7.firebasestorage.app",
    messagingSenderId: "555264000551",
    appId: "1:555264000551:web:bfa335800fa851ce45c402"
};


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

export { db };