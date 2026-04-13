const fs = require('fs');

const data = {
  ua: {
    title: "Пропущені ({{count}})",
    subtitle_active: "У вас є непрочитані повідомлення від цих користувачів",
    subtitle_empty: "Немає пропущених повідомлень",
    loading: "Завантаження...",
    new_messages: "{{count}} нових повідомлень",
    one_new_message: "1 нове повідомлення",
    all_caught_up: "Все прочитано!",
    no_missed: "Немає пропущених повідомлень",
    icon: "🎉"
  },
  en: {
    title: "Missed Messages ({{count}})",
    subtitle_active: "You have unread messages from these users",
    subtitle_empty: "No missed messages",
    loading: "Loading notifications...",
    new_messages: "{{count}} new messages",
    one_new_message: "1 new message",
    all_caught_up: "All caught up!",
    no_missed: "No missed messages",
    icon: "🎉"
  },
  de: {
    title: "Verpasste Nachrichten ({{count}})",
    subtitle_active: "Sie haben ungelesene Nachrichten",
    subtitle_empty: "Keine verpassten Nachrichten",
    loading: "Wird geladen...",
    new_messages: "{{count}} neue Nachrichten",
    one_new_message: "1 neue Nachricht",
    all_caught_up: "Alles gelesen!",
    no_missed: "Keine verpassten Nachrichten",
    icon: "🎉"
  },
  es: {
    title: "Mensajes perdidos ({{count}})",
    subtitle_active: "Tienes mensajes sin leer",
    subtitle_empty: "No hay mensajes perdidos",
    loading: "Cargando notificaciones...",
    new_messages: "{{count}} mensajes nuevos",
    one_new_message: "1 mensaje nuevo",
    all_caught_up: "¡Todo al día!",
    no_missed: "No hay mensajes perdidos",
    icon: "🎉"
  },
  fr: {
    title: "Messages manqués ({{count}})",
    subtitle_active: "Vous avez des messages non lus",
    subtitle_empty: "Aucun message manqué",
    loading: "Chargement...",
    new_messages: "{{count}} nouveaux messages",
    one_new_message: "1 nouveau message",
    all_caught_up: "Tout est lu !",
    no_missed: "Aucun message manqué",
    icon: "🎉"
  }
};

['en', 'ua', 'de', 'es', 'fr'].forEach(lang => {
  const filePath = `./locales/${lang}.json`;
  if (fs.existsSync(filePath)) {
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    fileData.notifications = { ...fileData.notifications, ...data[lang] };
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
  }
});
console.log('Done!');
