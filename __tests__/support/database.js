const state = {
  users: [],
  artists: [],
  songs: [],
  artistProfiles: [],
  venueProfiles: [],
  bookings: [],
  queries: [],
  healthError: false,
};

const nextIds = {};
const timestamp = '2026-01-02T03:04:05.000Z';

function resetDatabase() {
  for (const key of ['users', 'artists', 'songs', 'artistProfiles', 'venueProfiles', 'bookings', 'queries']) {
    state[key].length = 0;
  }
  state.healthError = false;
  Object.assign(nextIds, {
    users: 100,
    artists: 100,
    songs: 100,
    artistProfiles: 100,
    venueProfiles: 100,
    bookings: 100,
  });
}

function assignId(table, id) {
  if (id !== undefined) return Number(id);
  return nextIds[table]++;
}

function seedUser(user = {}) {
  const record = {
    id: assignId('users', user.id),
    name: 'Test User',
    email: `user-${nextIds.users}@example.test`,
    password: 'test-password',
    role: 'artist',
    createdAt: timestamp,
    ...user,
  };
  state.users.push(record);
  return record;
}

function seedArtist(artist = {}) {
  const record = {
    id: assignId('artists', artist.id),
    name: 'Sample Artist',
    genre: 'Jazz',
    bio: 'A sample artist.',
    ...artist,
  };
  state.artists.push(record);
  return record;
}

function seedSong(song = {}) {
  const record = {
    id: assignId('songs', song.id),
    artistId: 10,
    title: 'Sample Song',
    genre: 'Jazz',
    description: 'A sample track.',
    audioUrl: 'https://example.test/audio.mp3',
    coverImage: 'https://example.test/cover.jpg',
    uploadDate: '2026-01-01',
    createdAt: timestamp,
    ...song,
  };
  state.songs.push(record);
  return record;
}

function seedArtistProfile(profile = {}) {
  const record = {
    id: assignId('artistProfiles', profile.id),
    userId: 10,
    stageName: 'Sample Artist',
    genre: 'Jazz',
    bio: 'A sample artist bio.',
    location: 'Nairobi',
    performanceFee: '500.00',
    profileImage: null,
    instagram: null,
    youtube: null,
    spotify: null,
    ...profile,
  };
  state.artistProfiles.push(record);
  return record;
}

function seedVenueProfile(profile = {}) {
  const record = {
    id: assignId('venueProfiles', profile.id),
    userId: 20,
    venueName: 'Sample Venue',
    location: 'Nairobi',
    capacity: 100,
    supportedGenres: 'Jazz',
    description: 'A sample venue.',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...profile,
  };
  state.venueProfiles.push(record);
  return record;
}

function seedBooking(booking = {}) {
  const record = {
    id: assignId('bookings', booking.id),
    artistId: 10,
    venueId: 20,
    createdByUserId: 10,
    eventDate: '2026-12-01',
    offeredFee: '650.00',
    status: 'Pending',
    notes: 'A sample booking.',
    createdAt: timestamp,
    ...booking,
  };
  state.bookings.push(record);
  return record;
}

function result(rows) {
  return [rows, []];
}

function writeResult(affectedRows, insertId) {
  return [{ affectedRows, ...(insertId === undefined ? {} : { insertId }) }, []];
}

function withDateFee(value) {
  return value === undefined ? null : String(Number(value).toFixed(2));
}

function userView(user) {
  const { id, name, email, role, createdAt } = user;
  return { id, name, email, role, createdAt };
}

function songView(song) {
  const { id, artistId, title, genre, description, audioUrl, coverImage, uploadDate, createdAt } = song;
  return { id, artistId, title, genre, description, audioUrl, coverImage, uploadDate, createdAt };
}

function artistProfileView(profile) {
  const {
    id, userId, stageName, genre, bio, location, performanceFee, profileImage,
    instagram, youtube, spotify,
  } = profile;
  return { id, userId, stageName, genre, bio, location, performanceFee, profileImage, instagram, youtube, spotify };
}

function venueProfileView(profile) {
  const {
    id, userId, venueName, location, capacity, supportedGenres, description, createdAt, updatedAt,
  } = profile;
  return { id, userId, venueName, location, capacity, supportedGenres, description, createdAt, updatedAt };
}

function bookingView(booking) {
  const {
    id, artistId, venueId, eventDate, createdByUserId, offeredFee, status, notes, createdAt,
  } = booking;
  return { id, artistId, venueId, eventDate, createdByUserId, offeredFee, status, notes, createdAt };
}

const db = {
  async query(sql, parameters = []) {
    const statement = sql.replace(/\s+/g, ' ').trim();
    state.queries.push({ statement, parameters });

    if (statement === 'SELECT 1') {
      if (state.healthError) throw new Error('test database unavailable');
      return result([{ 1: 1 }]);
    }

    if (statement.startsWith('SELECT') && statement.includes('FROM artists')) {
      const rows = statement.includes('WHERE id = ?')
        ? state.artists.filter(({ id }) => String(id) === String(parameters[0]))
        : [...state.artists].sort((a, b) => b.id - a.id);
      return result(rows.map(({ id, name, genre, bio }) => ({ id, name, genre, bio })));
    }

    if (statement.startsWith('SELECT') && statement.includes('FROM songs')) {
      const rows = statement.includes('WHERE id = ?')
        ? state.songs.filter(({ id }) => String(id) === String(parameters[0]))
        : [...state.songs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return result(rows.map(songView));
    }
    if (statement.startsWith('INSERT INTO songs')) {
      const [artistId, title, genre, description, audioUrl, coverImage, uploadDate] = parameters;
      const song = seedSong({
        artistId: Number(artistId),
        title,
        genre,
        description,
        audioUrl,
        coverImage,
        uploadDate,
        createdAt: timestamp,
      });
      return writeResult(1, song.id);
    }
    if (statement.startsWith('UPDATE songs')) {
      const [title, genre, description, audioUrl, coverImage, uploadDate, id, artistId] = parameters;
      const song = state.songs.find((item) =>
        String(item.id) === String(id) && String(item.artistId) === String(artistId));
      if (!song) return writeResult(0);
      Object.assign(song, { title, genre, description, audioUrl, coverImage, uploadDate });
      return writeResult(1);
    }
    if (statement.startsWith('DELETE FROM songs')) {
      const [id, artistId] = parameters;
      const index = state.songs.findIndex((item) =>
        String(item.id) === String(id) && String(item.artistId) === String(artistId));
      if (index < 0) return writeResult(0);
      state.songs.splice(index, 1);
      return writeResult(1);
    }

    if (statement.startsWith('SELECT') && statement.includes('FROM users')) {
      if (statement.includes('LOWER(email)')) {
        const user = state.users.find(({ email }) =>
          email.toLowerCase() === String(parameters[0]).toLowerCase());
        return result(user ? [{ id: user.id, name: user.name, email: user.email, role: user.role, password: user.password }] : []);
      }
      const rows = state.users.filter(({ id }) => String(id) === String(parameters[0]));
      return result(statement.includes('password')
        ? rows.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, password: user.password }))
        : rows.map(userView));
    }
    if (statement.startsWith('INSERT INTO users')) {
      const [name, email, password, role] = parameters;
      if (state.users.some((user) => user.email.toLowerCase() === String(email).toLowerCase())) {
        const error = new Error('Duplicate email');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      const user = seedUser({ name, email, password, role });
      return writeResult(1, user.id);
    }
    if (statement.startsWith('UPDATE users')) {
      const hasPasswordOnly = /^UPDATE users SET password = \? WHERE id = \?$/.test(statement);
      if (hasPasswordOnly) {
        const [password, id] = parameters;
        const user = state.users.find((item) => String(item.id) === String(id));
        if (!user) return writeResult(0);
        user.password = password;
        return writeResult(1);
      }

      const hasPassword = statement.includes('password = ?');
      const id = parameters.at(-1);
      const user = state.users.find((item) => String(item.id) === String(id));
      if (!user) return writeResult(0);
      const [name, email] = parameters;
      if (state.users.some((item) => item.id !== user.id && item.email.toLowerCase() === String(email).toLowerCase())) {
        const error = new Error('Duplicate email');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      user.name = name;
      user.email = email;
      if (hasPassword) user.password = parameters[2];
      return writeResult(1);
    }
    if (statement.startsWith('DELETE FROM users')) {
      const [id] = parameters;
      const index = state.users.findIndex((user) => String(user.id) === String(id));
      if (index < 0) return writeResult(0);
      state.users.splice(index, 1);
      return writeResult(1);
    }

    if (statement.startsWith('SELECT') && statement.includes('FROM artist_profiles')) {
      const rows = statement.includes('WHERE user_id = ?')
        ? state.artistProfiles.filter(({ userId }) => String(userId) === String(parameters[0]))
        : [...state.artistProfiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return result(rows.map(artistProfileView));
    }
    if (statement.startsWith('INSERT INTO artist_profiles')) {
      const [userId, stageName, genre, bio, location, performanceFee, profileImage, instagram, youtube, spotify] = parameters;
      let profile = state.artistProfiles.find((item) => String(item.userId) === String(userId));
      if (!profile) {
        profile = seedArtistProfile({ userId: Number(userId) });
      }
      Object.assign(profile, {
        stageName, genre, bio, location, performanceFee: withDateFee(performanceFee),
        profileImage, instagram, youtube, spotify, updatedAt: timestamp,
      });
      return writeResult(1);
    }
    if (statement.startsWith('DELETE FROM artist_profiles')) {
      const [userId] = parameters;
      const index = state.artistProfiles.findIndex(({ userId: owner }) => String(owner) === String(userId));
      if (index < 0) return writeResult(0);
      state.artistProfiles.splice(index, 1);
      return writeResult(1);
    }

    if (statement.startsWith('SELECT') && statement.includes('FROM venue_profiles')) {
      const rows = statement.includes('WHERE id = ?')
        ? state.venueProfiles.filter(({ id }) => String(id) === String(parameters[0]))
        : [...state.venueProfiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return result(rows.map(venueProfileView));
    }
    if (statement.startsWith('INSERT INTO venue_profiles')) {
      const [userId, venueName, location, capacity, supportedGenres, description] = parameters;
      const profile = seedVenueProfile({
        userId: Number(userId),
        venueName,
        location,
        capacity,
        supportedGenres,
        description,
      });
      return writeResult(1, profile.id);
    }
    if (statement.startsWith('UPDATE venue_profiles')) {
      const [venueName, location, capacity, supportedGenres, description, id, userId] = parameters;
      const profile = state.venueProfiles.find((item) =>
        String(item.id) === String(id) && String(item.userId) === String(userId));
      if (!profile) return writeResult(0);
      Object.assign(profile, { venueName, location, capacity, supportedGenres, description, updatedAt: timestamp });
      return writeResult(1);
    }
    if (statement.startsWith('DELETE FROM venue_profiles')) {
      const [id, userId] = parameters;
      const index = state.venueProfiles.findIndex((item) =>
        String(item.id) === String(id) && String(item.userId) === String(userId));
      if (index < 0) return writeResult(0);
      state.venueProfiles.splice(index, 1);
      return writeResult(1);
    }

    if (statement.startsWith('SELECT') && statement.includes('FROM bookings')) {
      let rows;
      if (statement.includes('WHERE id = ? AND (artist_id = ? OR venue_id = ?)')) {
        const [id, artistId, venueId] = parameters;
        rows = state.bookings.filter((item) =>
          String(item.id) === String(id) &&
          (String(item.artistId) === String(artistId) || String(item.venueId) === String(venueId)));
      } else if (statement.includes('WHERE id = ? AND artist_id = ?')) {
        const [id, ownerId] = parameters;
        rows = state.bookings.filter((item) =>
          String(item.id) === String(id) && String(item.artistId) === String(ownerId));
      } else if (statement.includes('WHERE id = ? AND venue_id = ?')) {
        const [id, ownerId] = parameters;
        rows = state.bookings.filter((item) =>
          String(item.id) === String(id) && String(item.venueId) === String(ownerId));
      } else if (statement.includes('WHERE id = ?')) {
        rows = state.bookings.filter(({ id }) => String(id) === String(parameters[0]));
      } else {
        const [artistId, venueId] = parameters;
        rows = state.bookings.filter((item) =>
          String(item.artistId) === String(artistId) || String(item.venueId) === String(venueId));
        rows.sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));
      }
      return result(rows.map(bookingView));
    }
    if (statement.startsWith('INSERT INTO bookings')) {
      const [artistId, venueId, createdByUserId, eventDate, offeredFee, status, notes] = parameters;
      const booking = seedBooking({
        artistId: Number(artistId),
        venueId: Number(venueId),
        createdByUserId: Number(createdByUserId),
        eventDate: eventDate ?? null,
        offeredFee: withDateFee(offeredFee) ?? '0.00',
        status,
        notes: notes ?? null,
      });
      return writeResult(1, booking.id);
    }
    if (statement.startsWith('UPDATE bookings')) {
      const [eventDate, offeredFee, status, notes, id, ownerId, currentStatus] = parameters;
      const ownerField = statement.includes('AND artist_id = ?') ? 'artistId' : 'venueId';
      const booking = state.bookings.find((item) =>
        String(item.id) === String(id) &&
        String(item[ownerField]) === String(ownerId) &&
        item.status === currentStatus);
      if (!booking) return writeResult(0);
      Object.assign(booking, {
        eventDate: eventDate ?? null,
        offeredFee: withDateFee(offeredFee) ?? '0.00',
        status,
        notes: notes ?? null,
      });
      return writeResult(1);
    }
    if (statement.startsWith('DELETE FROM bookings')) {
      const [id, ownerId] = parameters;
      const ownerField = statement.includes('AND artist_id = ?') ? 'artistId' : 'venueId';
      const index = state.bookings.findIndex((item) =>
        String(item.id) === String(id) && String(item[ownerField]) === String(ownerId));
      if (index < 0) return writeResult(0);
      state.bookings.splice(index, 1);
      return writeResult(1);
    }

    throw new Error(`Unexpected test database query: ${statement}`);
  },
};

resetDatabase();

module.exports = {
  db,
  resetDatabase,
  seedArtist,
  seedArtistProfile,
  seedBooking,
  seedSong,
  seedUser,
  seedVenueProfile,
  state,
};
