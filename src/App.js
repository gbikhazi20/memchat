import React, { useRef, useState, useEffect } from "react";
import "./App.css";

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  orderBy,
  limit,
  query,
  where,
  serverTimestamp,
  addDoc,
  getDoc,
  getDocs,
  doc,
  setDoc,
} from "firebase/firestore";

import { useAuthState } from "react-firebase-hooks/auth";
import { useCollectionData } from "react-firebase-hooks/firestore";

// Firebase config remains the same
const firebaseConfig = {
  apiKey: "AIzaSyCIQYDhh8odCnjYvEvgxOKoQCeI3po89go",
  authDomain: "memchat24.firebaseapp.com",
  projectId: "memchat24",
  storageBucket: "memchat24.firebasestorage.app",
  messagingSenderId: "675240475611",
  appId: "1:675240475611:web:b3c8171ec50568b54ac5fe",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);

function App() {
  const [user] = useAuthState(auth);

  // Create or update user profile when they sign in
  useEffect(() => {
    const createUserProfile = async () => {
      if (user) {
        const userRef = doc(firestore, "users", user.uid);
        await setDoc(
          userRef,
          {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastSeen: serverTimestamp(),
          },
          { merge: true }
        ); // merge: true will update existing fields and keep others
      }
    };

    createUserProfile();
  }, [user]);

  return (
    <div className="App">
      <header className="App-header">{user && <SignOut />}</header>

      <section>{user ? <ChatContainer /> : <SignIn />}</section>
    </div>
  );
}

function SignIn() {
  const signInWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };
  return (
    <button className="sign-in" onClick={signInWithGoogle}>
      Sign in with Google
    </button>
  );
}

function SignOut() {
  return (
    auth.currentUser && <button onClick={() => signOut(auth)}>Sign Out</button>
  );
}

function ChatContainer() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [chats, setChats] = useState([]);
  const [chatUsers, setChatUsers] = useState({});

  useEffect(() => {
    const fetchChats = async () => {
      const chatsRef = collection(firestore, "chats");
      const q = query(
        chatsRef,
        where("participants", "array-contains", auth.currentUser.uid)
      );

      try {
        const querySnapshot = await getDocs(q);
        const chatsList = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setChats(chatsList);

        // Fetch all users involved in these chats
        const userIds = new Set();
        chatsList.forEach((chat) => {
          chat.participants.forEach((userId) => userIds.add(userId));
        });

        const usersData = {};
        await Promise.all(
          Array.from(userIds).map(async (userId) => {
            const userDoc = doc(firestore, "users", userId);
            const userSnap = await getDoc(userDoc);
            if (userSnap.exists()) {
              usersData[userId] = userSnap.data();
            }
          })
        );

        setChatUsers(usersData);
      } catch (error) {
        console.error("Error fetching chats:", error);
      }
    };

    if (auth.currentUser) {
      fetchChats();
    }
  }, []);

  return (
    <div className="chat-container">
      <ChatList
        chats={chats}
        chatUsers={chatUsers}
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
      />
      {selectedChat ? (
        <ChatRoom chatId={selectedChat} chatUsers={chatUsers} />
      ) : (
        <div className="no-chat-selected">
          Select a chat or start a new conversation
        </div>
      )}
    </div>
  );
}

const MessageInput = React.memo(({ chatId }) => {
  const [formValue, setFormValue] = useState("");

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!formValue.trim()) return;

    const { uid, photoURL } = auth.currentUser;

    try {
      // Add message
      await addDoc(collection(firestore, "messages"), {
        text: formValue,
        createdAt: serverTimestamp(),
        uid,
        chatId,
        photoURL,
      });

      // Update chat's last message
      const chatRef = doc(firestore, "chats", chatId);
      await setDoc(
        chatRef,
        {
          lastMessage: formValue,
          lastMessageAt: serverTimestamp(),
        },
        { merge: true }
      );

      setFormValue("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <form onSubmit={sendMessage}>
      <input
        value={formValue}
        onChange={(e) => setFormValue(e.target.value)}
        placeholder="Type a message..."
      />
      <button type="submit" disabled={!formValue.trim()}>
        Send
      </button>
    </form>
  );
});

const MessagesList = React.memo(({ messages, chatUsers, dummy }) => {
  useEffect(() => {
    dummy?.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dummy]);

  return (
    <div className="messages">
      {messages && messages.length > 0 ? (
        messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} user={chatUsers[msg.uid]} />
        ))
      ) : (
        <div>No messages yet. Start the conversation!</div>
      )}
      <div ref={dummy}></div>
    </div>
  );
});

function ChatList({ chats, chatUsers, selectedChat, onSelectChat }) {
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const searchUsers = async (email) => {
    if (!email) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const usersRef = collection(firestore, "users");
    const q = query(
      usersRef,
      where("email", ">=", email),
      where("email", "<=", email + "\uf8ff"),
      limit(5)
    );

    const querySnapshot = await getDocs(q);
    const users = querySnapshot.docs
      .map((doc) => doc.data())
      .filter((user) => user.uid !== auth.currentUser.uid);

    setSearchResults(users);
    setSearching(false);
  };

  const createNewChat = async (otherUser) => {
    // Check if chat already exists
    const existingChat = chats.find((chat) =>
      chat.participants.includes(otherUser.uid)
    );

    console.log("existingChat", existingChat);

    if (existingChat) {
      onSelectChat(existingChat.id);
      setSearchEmail("");
      setSearchResults([]);
      return;
    }

    // Create new chat
    const chatsRef = collection(firestore, "chats");
    const newChat = await addDoc(chatsRef, {
      participants: [auth.currentUser.uid, otherUser.uid],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    });

    onSelectChat(newChat.id);
    setSearchEmail("");
    setSearchResults([]);
  };

  return (
    <div className="chat-list">
      <div className="search-container">
        <input
          value={searchEmail}
          onChange={(e) => {
            setSearchEmail(e.target.value);
            searchUsers(e.target.value);
          }}
          placeholder="Search users by email"
          className="search-input"
        />
        {searching && <div className="searching">Searching...</div>}
        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((user) => (
              <div
                key={user.uid}
                className="search-result-item"
                onClick={() => createNewChat(user)}
              >
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="avatar-small"
                />
                <div className="user-info">
                  <div className="display-name">{user.displayName}</div>
                  <div className="email">{user.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chats">
        {chats.map((chat) => {
          const otherUser =
            chatUsers[
              chat.participants.find((p) => p !== auth.currentUser.uid)
            ];

          if (!otherUser) return null;

          return (
            <div
              key={chat.id}
              className={`chat-item ${
                selectedChat === chat.id ? "selected" : ""
              }`}
              onClick={() => onSelectChat(chat.id)}
            >
              <img
                src={otherUser.photoURL}
                alt={otherUser.displayName}
                className="avatar-small"
              />
              <div className="chat-item-info">
                <div className="display-name">{otherUser.displayName}</div>
                <div className="last-message">
                  {chat.lastMessage || "No messages yet"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatRoom({ chatId, chatUsers }) {
  const messagesRef = collection(firestore, "messages");
  const messagesQuery = query(
    messagesRef,
    where("chatId", "==", chatId),
    orderBy("createdAt"),
    limit(25)
  );

  const [messages] = useCollectionData(messagesQuery, { idField: "id" });
  const dummy = useRef();

  return (
    <div className="chat-room">
      <MessagesList messages={messages} chatUsers={chatUsers} dummy={dummy} />
      <MessageInput chatId={chatId} />
    </div>
  );
}

// Optimized ChatMessage Component
const ChatMessage = React.memo(({ message, user }) => {
  if (!message) return null;

  const { text, uid, photoURL: messagePhotoURL } = message;
  const messageClass = uid === auth.currentUser.uid ? "sent" : "received";

  return (
    <div className={`message ${messageClass}`}>
      <img
        src={user?.photoURL || messagePhotoURL || "default-avatar-url"}
        alt={user?.displayName || "User"}
      />
      <p>{text}</p>
    </div>
  );
});

export { App };
