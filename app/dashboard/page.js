'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp, doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAILS } from '../../lib/firebase';
import Chat from '../../components/Chat';
import { useUnreadCount } from '../../lib/useUnreadCount';