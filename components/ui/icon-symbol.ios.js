import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}) {
  // SF Symbols for gender (female, male) require iOS 16.0+
  // Use fallbacks for these and other potentially missing icons to ensure they work on older iOS versions
  let symbolName = name;
  if (name === 'timer') symbolName = 'clock.fill';

  if (name.startsWith('mat:')) {
    return <MaterialIcons name={name.replace('mat:', '')} size={size} color={color} style={style} />;
  }
  if (name.startsWith('mc:')) {
    return <MaterialCommunityIcons name={name.replace('mc:', '')} size={size} color={color} style={style} />;
  }
  if (name.startsWith('ion:')) {
    return <Ionicons name={name.replace('ion:', '')} size={size} color={color} style={style} />;
  }

  if (name === 'female') {
    return <MaterialCommunityIcons name="gender-female" size={size} color={color} style={style} />;
  }
  if (name === 'male') {
    return <MaterialCommunityIcons name="gender-male" size={size} color={color} style={style} />;
  }
  if (name === 'calendar') {
    return <Ionicons name="calendar-outline" size={size} color={color} style={style} />;
  }
  if (name === 'person.crop.circle.badge.questionmark') {
    return <Ionicons name="person-circle-outline" size={size} color={color} style={style} />;
  }

  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={symbolName}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
