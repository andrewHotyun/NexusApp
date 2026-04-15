// Gift system configuration for mobile app
// Synchronized with the browser version (nexus/src/config/gifts.js)

export const GIFTS = [
  {
    id: 'shoe',
    emoji: '👠',
    nameKey: 'gifts.shoe',
    minutes: 5,
    color: '#FF6B9D',
    gradientColors: ['#FF6B9D', '#C94B7C'],
  },
  {
    id: 'flowers',
    emoji: '💐',
    nameKey: 'gifts.flowers',
    minutes: 10,
    color: '#FF4D6D',
    gradientColors: ['#FF4D6D', '#C9184A'],
  },
  {
    id: 'bear',
    emoji: '🧸',
    nameKey: 'gifts.bear',
    minutes: 15,
    color: '#A0522D',
    gradientColors: ['#D2996C', '#A0522D'],
  },
  {
    id: 'pearl',
    emoji: '💎',
    nameKey: 'gifts.pearl',
    minutes: 20,
    color: '#7B68EE',
    gradientColors: ['#A78BFA', '#7B68EE'],
  },
  {
    id: 'crown',
    emoji: '👑',
    nameKey: 'gifts.crown',
    minutes: 50,
    color: '#FFD700',
    gradientColors: ['#FFD700', '#FFA500'],
  },
  {
    id: 'fire_heart',
    emoji: '❤️‍🔥',
    nameKey: 'gifts.fire_heart',
    minutes: 200,
    color: '#FF4500',
    gradientColors: ['#FF4500', '#DC143C'],
  },
];

export const getGiftById = (id) => GIFTS.find(g => g.id === id);

export default GIFTS;
