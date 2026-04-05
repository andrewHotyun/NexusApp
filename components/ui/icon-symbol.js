// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'envelope.fill': 'email',
  'lock.fill': 'lock',
  'person.fill': 'person',
  'flag.fill': 'flag',
  'gift.fill': 'cake',
  'message.fill': 'chat',
  'globe.americas.fill': 'public',
  'bubble.left.and.bubble.right.fill': 'chat-bubble-outline',
  'bubble.left.fill': 'chat-bubble',
  'camera.fill': 'photo-camera',
  'person.text.rectangle.fill': 'contact-page',
};

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}) {
  const iconName = MAPPING[name] || 'help-outline'; // Safe fallback
  return <MaterialIcons color={color} size={size} name={iconName} style={style} />;
}
