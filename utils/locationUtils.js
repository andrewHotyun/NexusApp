import { State } from 'country-state-city';

/**
 * Deduplicates a list of cities by name.
 * If multiple cities have the same name, it tries to prioritize the one
 * where the city name is part of the state name (e.g., "Zhytomyr" in "Zhytomyrska oblast").
 * 
 * @param {Array} cities - List of city objects from country-state-city
 * @returns {Array} - Deduplicated list of cities
 */
export const deduplicateCities = (cities) => {
  if (!cities || cities.length === 0) return [];

  const map = new Map();

  cities.forEach(city => {
    const existing = map.get(city.name);
    if (!existing) {
      map.set(city.name, city);
    } else {
      // Heuristic: Prefer the city if its name is part of the state name
      const state = State.getStateByCodeAndCountry(city.stateCode, city.countryCode);
      const existingState = State.getStateByCodeAndCountry(existing.stateCode, existing.countryCode);
      
      const stateName = state?.name || '';
      const existingStateName = existingState?.name || '';
      
      const currentIsCapital = stateName.toLowerCase().includes(city.name.toLowerCase());
      const existingIsCapital = existingStateName.toLowerCase().includes(city.name.toLowerCase());

      // If current is more likely to be the "correct" or main city, replace existing
      if (currentIsCapital && !existingIsCapital) {
        map.set(city.name, city);
      }
      // Otherwise keep the existing one (usually the first one found in the library)
    }
  });

  return Array.from(map.values());
};
