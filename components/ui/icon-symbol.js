import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { View, Platform } from 'react-native';

/**
 * Add your SF Symbols to Ionicons mappings here.
 * - see Ionicons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code-slash',
  'chevron.right': 'chevron-forward',
  'chevron.left': 'chevron-back',
  'envelope.fill': 'mail',
  'lock.fill': 'lock-closed',
  'person.fill': 'person',
  'flag.fill': 'flag',
  'gift.fill': 'gift',
  'message.fill': 'chatbubble',
  'globe.americas.fill': 'globe',
  'bubble.left.and.bubble.right.fill': 'mat:chat',
  'bubble.left.fill': 'mat:chat',
  'camera.fill': 'mat:photo-camera',
  'person.text.rectangle.fill': 'mat:person-outline',
  'person.2.fill': 'mat:people',
  'person.badge.plus': 'person-add-outline',
  'person.badge.minus': 'custom:person-remove-circle',
  'person.badge.xmark': 'person-remove-outline',
  'bell.fill': 'mat:notifications',
  'bell.slash.fill': 'mat:notifications-off',
  'clock.fill': 'time',
  'video.fill': 'mat:videocam',
  'arrow.left': 'arrow-back',
  'eye.fill': 'eye',
  'eye.slash.fill': 'eye-off',
  'rectangle.portrait.and.arrow.right': 'log-out',
  'star.fill': 'star',
  'heart.fill': 'heart',
  'heart': 'heart-outline',
  'gearshape.fill': 'settings',
  'translate': 'language',
  'plus': 'add',
  'folder.fill': 'folder',
  'photo.on.rectangle.angled': 'images',
  'play.fill': 'play',
  'play.circle.fill': 'play-circle',
  'photo': 'image',
  'chevron.down': 'chevron-down',
  'trash.fill': 'trash',
  'location.fill': 'location',
  'calendar.fill': 'calendar',
  'calendar': 'calendar',
  'birthday.cake.fill': 'mat:cake',
  'female.fill': 'female',
  'male.fill': 'male',
  'female': 'female',
  'male': 'male',
  'person.crop.circle.badge.xmark': 'custom:person-block',
  'checkmark': 'mat:check',
  'xmark': 'mat:close',
  'magnifyingglass': 'search',
  'checkmark.circle.fill': 'mat:check-circle',
  'exclamationmark.circle.fill': 'alert-circle',
  'xmark.circle.fill': 'mat:cancel',
  'info.circle.fill': 'mat:info-outline',
  'line.3.horizontal.decrease.circle': 'mat:filter-list',
  'person.crop.circle.badge.questionmark': 'custom:person-question',
  'ellipsis.circle': 'ellipsis-horizontal-circle',
  'person.slash.fill': 'person-remove-outline',
  'person.fill.checkmark': 'lock-open',
  'person.crop.circle.badge.checkmark': 'mat:account-circle',
  'slash.circle': 'ban',
  'paperclip': 'attach',
  'face.smiling': 'happy-outline',
  'mic': 'mic-outline',
  'gift': 'gift-outline',
};

/**
 * An icon component that uses native SF Symbols on iOS, and Ionicons on Android and web.
 * This ensures a consistent, high-quality look across platforms.
 * Icon `name`s are based on SF Symbols and require manual mapping to Ionicons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}) {
  const iconName = MAPPING[name] || 'help-outline'; // Safe fallback

  if (iconName === 'custom:person-question' && Platform.OS !== 'ios') {
    return (
      <View style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
        <Ionicons name="person-circle-outline" size={size} color={color} />
        <View style={{ 
          position: 'absolute', 
          bottom: -size * 0.05, 
          left: -size * 0.05, 
          backgroundColor: '#030e21', // Dark background to match Nexus
          borderRadius: size * 0.25,
          padding: 0
        }}>
          <Ionicons name="help-circle" size={size * 0.5} color={color} />
        </View>
      </View>
    );
  }

  if (iconName === 'custom:person-remove-circle' && Platform.OS !== 'ios') {
    return (
      <View style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
        <Ionicons name="person-outline" size={size} color={color} />
        <View style={{ 
          position: 'absolute', 
          bottom: -size * 0.1, 
          right: -size * 0.1, 
          backgroundColor: '#1e293b', // Match ActionMenu background
          borderRadius: size * 0.3,
          padding: 0
        }}>
          <Ionicons name="remove-circle" size={size * 0.6} color={color} />
        </View>
      </View>
    );
  }

  if (iconName === 'custom:person-block' && Platform.OS !== 'ios') {
    return (
      <View style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
        {/* Main person circle outline */}
        <Ionicons name="person-circle-outline" size={size} color={color} />
        {/* Badge in the corner */}
        <View style={{ 
          position: 'absolute', 
          bottom: size * 0.05, 
          left: size * 0.05, 
          backgroundColor: '#030e21', // Dark background to match Nexus
          borderRadius: size * 0.25,
          padding: 0
        }}>
          <Ionicons name="close-circle" size={size * 0.45} color={color} />
        </View>
      </View>
    );
  }
  
  if (iconName.startsWith('mc:')) {
    return <MaterialCommunityIcons color={color} size={size} name={iconName.replace('mc:', '')} style={style} />;
  }
  
  if (iconName.startsWith('mat:')) {
    return <MaterialIcons color={color} size={size} name={iconName.replace('mat:', '')} style={style} />;
  }
  
  if (Platform.OS === 'ios') {
    return <Ionicons color={color} size={size} name={MAPPING[name] || name} style={style} />;
  }

  return <Ionicons color={color} size={size} name={iconName} style={style} />;
}
