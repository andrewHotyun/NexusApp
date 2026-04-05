import { db } from './firebase';
import { doc, getDoc, updateDoc, setDoc, increment, serverTimestamp, runTransaction, onSnapshot } from 'firebase/firestore';
import earningsManager from './earningsManager';

// Magic words in all 5 platform languages
const MAGIC_WORDS = [
  // Ukrainian
  'гарна', 'красива', 'чарівна', 'прекрасна',
  // English
  'beautiful', 'gorgeous', 'pretty', 'stunning',
  // German
  'schön', 'wunderschön', 'hübsch', 'bezaubernd',
  // Spanish
  'hermosa', 'bella', 'guapa', 'preciosa',
  // French
  'belle', 'magnifique', 'jolie', 'ravissante'
];

// 9 competitive games with winners
const COMPETITIVE_GAMES = ['rps', 'ttt', 'battleship', 'find_diff', 'memory', 'pong', 'quiz', 'killer', 'melody'];

class EasterEggManager {
  constructor() {
    this.userId = null;
    this.userGender = null;
    this.userName = null;
    this.achievements = null;
    this.initialized = false;
    this._celebrationCallback = null;
    this._heartPressedThisCall = false; // Track per-call heart press
  }

  // Register callback for showing celebration modal
  onCelebration(callback) {
    this._celebrationCallback = callback;
  }

  _showCelebration(easterEgg) {
    if (this._celebrationCallback) {
      this._celebrationCallback({
        userId: this.userId,
        userAvatar: this.userAvatar,
        ...easterEgg
      });
    }
  }

  // Initialize on user login — listen to Firestore for real-time remote achievements
  init(userId, userGender, userName) {
    if (this.initialized && this.userId === userId) return;
    
    if (this._unsubUser) {
      this._unsubUser();
    }
    
    this.userId = userId;
    this.userGender = userGender;
    this.userName = userName;

    try {
      const userRef = doc(db, 'users', userId);
      let isFirstLoad = true;
      
      this._unsubUser = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) {
          this.achievements = {};
          return;
        }
        const data = snap.data();
        const newUnlocked = data.achievements?.unlocked || {};
        
        if (!isFirstLoad) {
          const oldUnlocked = this.achievements?.unlocked || {};
          // If the girl receives the magic word from a guy remotely
          if (!oldUnlocked.magic_word_receiver && newUnlocked.magic_word_receiver && !this._isMale(this.userGender)) {
            this._showCelebration({
              id: 'magic_word',
              icon: '✨',
              userName: this.userName || data.name,
              reward: '10',
              rewardType: 'dollars'
            });
          }
        }
        
        this.achievements = data.achievements || {};
        this.userGender = data.gender || userGender;
        this.userName = data.name || userName;
        this.userAvatar = data.avatar || '';
        isFirstLoad = false;
      }, (err) => {
        console.warn('[EasterEgg] Failed to load achievements:', err);
        this.achievements = {};
      });
    } catch (err) {
      console.warn('[EasterEgg] Setup error:', err);
      this.achievements = {};
    }

    this.initialized = true;
  }

  // Reset per-call state (called when a new video call starts)
  resetCallState() {
    this._heartPressedThisCall = false;
  }

  // =========================================
  // 1. LUCKY 1000 — Random Chat Milestone
  // =========================================
  async trackRandomMatch(myUserId, myGender, myName, partnerUserId, partnerGender, partnerName) {
    if (!myUserId || !partnerUserId) return;

    try {
      // Increment both users' match counters atomically
      const myRef = doc(db, 'users', myUserId);
      const partnerRef = doc(db, 'users', partnerUserId);
      const easterEggsRef = doc(db, 'adminSettings', 'easter_eggs');

      // Use transaction to safely read + check + write
      const result = await runTransaction(db, async (tx) => {
        const myDoc = await tx.get(myRef);
        const partnerDoc = await tx.get(partnerRef);
        const eggsSnap = await tx.get(easterEggsRef);

        const myAch = myDoc.exists() ? (myDoc.data().achievements || {}) : {};
        const partnerAch = partnerDoc.exists() ? (partnerDoc.data().achievements || {}) : {};
        const eggsData = eggsSnap.exists() ? eggsSnap.data() : {};

        const myCount = (myAch.randomChatMatches || 0) + 1;
        const partnerCount = (partnerAch.randomChatMatches || 0) + 1;

        const myUnlocked = myAch.unlocked || {};
        const partnerUnlocked = partnerAch.unlocked || {};

        // Update my counter
        tx.update(myRef, { 'achievements.randomChatMatches': myCount });
        tx.update(partnerRef, { 'achievements.randomChatMatches': partnerCount });

        let myTriggered = false;
        let partnerTriggered = false;
        let globalClaimed = eggsData.lucky_1000_claimed || false;
        let claimedByUsers = [];

        // Check if I hit 1000
        if (myCount === 1000 && !myUnlocked.lucky_1000 && !globalClaimed) {
          const isMale = this._isMale(myGender);
          if (isMale) {
            tx.update(myRef, {
              'achievements.unlocked.lucky_1000': true,
              minutesBalance: increment(10)
            });
          } else {
            tx.update(myRef, { 'achievements.unlocked.lucky_1000': true });
          }
          myTriggered = true;
          claimedByUsers.push(myUserId);
        }

        // Check if partner hit 1000
        if (partnerCount === 1000 && !partnerUnlocked.lucky_1000 && (!globalClaimed || claimedByUsers.length > 0)) {
          const partnerIsMale = this._isMale(partnerGender);
          if (partnerIsMale) {
            tx.update(partnerRef, {
              'achievements.unlocked.lucky_1000': true,
              minutesBalance: increment(10)
            });
          } else {
            tx.update(partnerRef, { 'achievements.unlocked.lucky_1000': true });
          }
          partnerTriggered = true;
          claimedByUsers.push(partnerUserId);
        }

        // Mark globally claimed if triggered
        if (myTriggered || partnerTriggered) {
          tx.set(easterEggsRef, {
            ...eggsData,
            lucky_1000_claimed: true,
            lucky_1000_claimedBy: claimedByUsers,
            lucky_1000_claimedAt: serverTimestamp()
          }, { merge: true });
        }

        return { 
          myTriggered, 
          partnerTriggered, 
          isMale: this._isMale(myGender), 
          partnerIsMale: this._isMale(partnerGender) 
        };
      });

      if (result?.myTriggered) {
        if (!result.isMale) {
          try {
            await earningsManager.addDirectBonus(myUserId, 5, 'easter_egg_lucky_1000');
          } catch (_) {}
        }
        if (myUserId === this.userId) {
          setTimeout(() => {
            this._showCelebration({
              id: 'lucky_1000',
              icon: '🥇',
              userName: myName || this.userName,
              reward: result.isMale ? '10' : '5',
              rewardType: result.isMale ? 'minutes' : 'dollars'
            });
          }, 500);
        }
      }

      if (result?.partnerTriggered) {
        if (!result.partnerIsMale) {
          try {
            await earningsManager.addDirectBonus(partnerUserId, 5, 'easter_egg_lucky_1000');
          } catch (_) {}
        }
      }

    } catch (err) {
      console.warn('[EasterEgg] Lucky 1000 tracking error:', err);
    }
  }

  // =========================================
  // 2. MAGIC WORD — "Beautiful" 100 times
  // =========================================
  async trackMagicWord(senderId, senderGender, senderName, receiverId, receiverGender, messageText) {
    if (!senderId || !receiverId || !messageText) return;

    // Only count man → woman
    if (!this._isMale(senderGender) || this._isMale(receiverGender)) return;

    // Check if message contains any magic word
    const lowerText = messageText.toLowerCase();
    const containsMagicWord = MAGIC_WORDS.some(word => lowerText.includes(word));
    if (!containsMagicWord) return;

    try {
      const receiverRef = doc(db, 'users', receiverId);
      const easterEggsRef = doc(db, 'adminSettings', 'easter_eggs');

      const result = await runTransaction(db, async (tx) => {
        const receiverDoc = await tx.get(receiverRef);
        const eggsSnap = await tx.get(easterEggsRef);

        if (!receiverDoc.exists()) return null;
        
        const eggsData = eggsSnap.exists() ? eggsSnap.data() : {};
        if (eggsData.magic_word_claimed) return null; // GLOBAL CHECK

        const ach = receiverDoc.data().achievements || {};
        const unlocked = ach.unlocked || {};

        if (unlocked.magic_word_receiver) return null; // Already claimed

        const newCount = (ach.magicWordReceived || 0) + 1;
        tx.update(receiverRef, { 'achievements.magicWordReceived': newCount });

        if (newCount === 100) {
          // Girl gets $10
          tx.update(receiverRef, { 'achievements.unlocked.magic_word_receiver': true });

          // Guy gets 20 minutes
          const senderRef = doc(db, 'users', senderId);
          tx.update(senderRef, {
            'achievements.unlocked.magic_word_sender': true,
            minutesBalance: increment(20)
          });

          tx.set(easterEggsRef, {
            ...eggsData,
            magic_word_claimed: true,
            magic_word_claimedBy: [senderId, receiverId],
            magic_word_claimedAt: serverTimestamp()
          }, { merge: true });

          return { triggered: true, senderName, receiverName: receiverDoc.data().name };
        }

        return null;
      });

      if (result?.triggered) {
        // Add earnings for the girl
        try {
          const receiverRef2 = doc(db, 'users', receiverId);
          const recSnap = await getDoc(receiverRef2);
          if (recSnap.exists()) {
            await earningsManager.addDirectBonus(receiverId, 10, 'easter_egg_magic_word');
          }
        } catch (_) {}

        // Show celebration if current user is involved
        if (senderId === this.userId) {
          this._showCelebration({
            id: 'magic_word',
            icon: '✨',
            userName: senderName || this.userName,
            reward: '20',
            rewardType: 'minutes'
          });
        }
      }
    } catch (err) {
      console.warn('[EasterEgg] Magic Word tracking error:', err);
    }
  }

  // =========================================
  // 3. MIDNIGHT CALL — Call at exactly 00:00:00
  // =========================================
  async checkMidnightCall(myUserId, myGender, myName, partnerUserId, partnerGender, partnerName) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    // Must be exactly 00:00:00 (±1 second tolerance)
    if (hours !== 0 || minutes !== 0 || seconds > 1) return;

    try {
      const easterEggsRef = doc(db, 'adminSettings', 'easter_eggs');

      const result = await runTransaction(db, async (tx) => {
        const eggsSnap = await tx.get(easterEggsRef);
        const data = eggsSnap.exists() ? eggsSnap.data() : {};

        if (data.midnight_call_claimed) return null; // Already claimed by someone

        // First pair ever! Claim it
        tx.set(easterEggsRef, {
          ...data,
          midnight_call_claimed: true,
          midnight_call_claimedBy: [myUserId, partnerUserId],
          midnight_call_claimedAt: serverTimestamp()
        }, { merge: true });

        // Grant rewards
        const myRef = doc(db, 'users', myUserId);
        const partnerRef = doc(db, 'users', partnerUserId);

        const isMale = this._isMale(myGender);
        const partnerIsMale = this._isMale(partnerGender);

        if (isMale) {
          tx.update(myRef, {
            'achievements.unlocked.midnight_call': true,
            minutesBalance: increment(15)
          });
        } else {
          tx.update(myRef, { 'achievements.unlocked.midnight_call': true });
        }

        if (partnerIsMale) {
          tx.update(partnerRef, {
            'achievements.unlocked.midnight_call': true,
            minutesBalance: increment(15)
          });
        } else {
          tx.update(partnerRef, { 'achievements.unlocked.midnight_call': true });
        }

        return {
          triggered: true,
          myReward: isMale ? 'minutes' : 'dollars',
          partnerReward: partnerIsMale ? 'minutes' : 'dollars'
        };
      });

      if (result?.triggered) {
        // Add earnings for the woman
        const womanId = this._isMale(myGender) ? partnerUserId : myUserId;
        try {
          await earningsManager.addDirectBonus(womanId, 5, 'easter_egg_midnight_call');
        } catch (_) {}

        if (myUserId === this.userId) {
          this._showCelebration({
            id: 'midnight_call',
            icon: '🕛',
            userName: myName || this.userName,
            reward: this._isMale(myGender) ? '15' : '5',
            rewardType: this._isMale(myGender) ? 'minutes' : 'dollars'
          });
        }
      }
    } catch (err) {
      console.warn('[EasterEgg] Midnight Call check error:', err);
    }
  }

  // =========================================
  // 4. HEART STORM — 100 unique heart presses
  // =========================================
  async trackHeartPress(userId, userGender, userName) {
    if (!userId) return;

    // Only count first press per call
    if (this._heartPressedThisCall) return;
    this._heartPressedThisCall = true;

    try {
      const userRef = doc(db, 'users', userId);
      const easterEggsRef = doc(db, 'adminSettings', 'easter_eggs');

      const result = await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const eggsSnap = await tx.get(easterEggsRef);

        const ach = userSnap.exists() ? (userSnap.data().achievements || {}) : {};
        const eggsData = eggsSnap.exists() ? eggsSnap.data() : {};

        // Check if this user already contributed
        if (ach.heartPressContributed) return null;

        // Check if already claimed globally
        if (eggsData.heart_storm_claimed) return null;

        // Mark user as contributed
        tx.update(userRef, { 'achievements.heartPressContributed': true });

        // Increment global counter
        const newGlobalCount = (eggsData.heartPressesGlobal || 0) + 1;

        if (newGlobalCount === 100) {
          // 100th unique press! Claim globally
          tx.set(easterEggsRef, {
            ...eggsData,
            heartPressesGlobal: newGlobalCount,
            heart_storm_claimed: true,
            heart_storm_claimedBy: userId,
            heart_storm_claimedAt: serverTimestamp()
          }, { merge: true });

          const isMale = this._isMale(userGender);
          if (isMale) {
            tx.update(userRef, {
              'achievements.unlocked.heart_storm': true,
              minutesBalance: increment(10)
            });
          } else {
            tx.update(userRef, { 'achievements.unlocked.heart_storm': true });
          }

          return { triggered: true, isMale };
        } else {
          // Just increment global counter
          tx.set(easterEggsRef, {
            ...eggsData,
            heartPressesGlobal: newGlobalCount
          }, { merge: true });

          return null;
        }
      });

      if (result?.triggered) {
        if (!result.isMale) {
          try {
            await earningsManager.addDirectBonus(userId, 5, 'easter_egg_heart_storm');
          } catch (_) {}
        }

        if (userId === this.userId) {
          this._showCelebration({
            id: 'heart_storm',
            icon: '❤️‍🔥',
            userName: userName || this.userName,
            reward: result.isMale ? '10' : '5',
            rewardType: result.isMale ? 'minutes' : 'dollars'
          });
        }
      }
    } catch (err) {
      console.warn('[EasterEgg] Heart Storm tracking error:', err);
    }
  }

  // =========================================
  // 5. GAME MASTER — Win all 9 games in one call
  // =========================================
  // Returns a tracker object for a single video call
  createGameTracker() {
    return {
      winsInThisCall: new Set(), // Set of game IDs won
      lostInThisCall: false,     // If lost any game, disqualified

      recordWin(gameId) {
        if (!COMPETITIVE_GAMES.includes(gameId)) return;
        this.winsInThisCall.add(gameId);
      },

      recordLoss(gameId) {
        if (!COMPETITIVE_GAMES.includes(gameId)) return;
        this.lostInThisCall = true;
      },

      hasWonAll() {
        if (this.lostInThisCall) return false;
        return COMPETITIVE_GAMES.every(g => this.winsInThisCall.has(g));
      }
    };
  }

  async checkGameMaster(userId, userGender, userName, gameTracker) {
    if (!userId || !gameTracker) return;
    if (!gameTracker.hasWonAll()) return;

    try {
      const userRef = doc(db, 'users', userId);
      const easterEggsRef = doc(db, 'adminSettings', 'easter_eggs');

      const result = await runTransaction(db, async (tx) => {
        const eggsSnap = await tx.get(easterEggsRef);
        const eggsData = eggsSnap.exists() ? eggsSnap.data() : {};

        if (eggsData.game_master_claimed) return null; // Already claimed

        const isMale = this._isMale(userGender);

        tx.set(easterEggsRef, {
          ...eggsData,
          game_master_claimed: true,
          game_master_claimedBy: userId,
          game_master_claimedAt: serverTimestamp()
        }, { merge: true });

        if (isMale) {
          tx.update(userRef, {
            'achievements.unlocked.game_master': true,
            minutesBalance: increment(20)
          });
        } else {
          tx.update(userRef, { 'achievements.unlocked.game_master': true });
        }

        return { triggered: true, isMale };
      });

      if (result?.triggered) {
        if (!result.isMale) {
          try {
            await earningsManager.addDirectBonus(userId, 10, 'easter_egg_game_master');
          } catch (_) {}
        }

        if (userId === this.userId) {
          this._showCelebration({
            id: 'game_master',
            icon: '🎮',
            userName: userName || this.userName,
            reward: result.isMale ? '20' : '10',
            rewardType: result.isMale ? 'minutes' : 'dollars'
          });
        }
      }
    } catch (err) {
      console.warn('[EasterEgg] Game Master check error:', err);
    }
  }

  // =========================================
  // Helpers
  // =========================================
  _isMale(gender) {
    if (!gender) return false;
    const g = String(gender).toLowerCase().trim();
    return ['male', 'm', 'man', 'boy', 'чоловік', 'хлопець', 'ч', 'чол'].includes(g);
  }
}

// Singleton
const easterEggManager = new EasterEggManager();
export default easterEggManager;
export { COMPETITIVE_GAMES };
