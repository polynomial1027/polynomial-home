const colors = ['jade', 'blue', 'violet', 'rose', 'amber'];
function view(user) {
  const p = user.profile || {};
  return { bio: p.bio || '', emoji: p.emoji || '', color: colors.includes(p.color) ? p.color : 'jade', compact: p.compact === true, messageNotifications: p.messageNotifications !== false, messagePreview: p.messagePreview !== false, messageSound: p.messageSound === true, updatedAt: p.updatedAt || null, avatarUrl: p.avatar ? `/api/avatars/${user.id}?v=${encodeURIComponent(p.updatedAt)}` : null };
}
function update(user, input) {
  if (input.ifUnmodifiedSince !== (user.profile?.updatedAt || null)) throw Object.assign(new Error('个人资料已在其他设备修改，请刷新再试'), { status: 409 });
  if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.trim().length > 40) throw new Error('昵称需为 1–40 字');
  if (typeof input.bio !== 'string' || input.bio.length > 160 || typeof input.emoji !== 'string' || [...input.emoji].length > 8 || !colors.includes(input.color)) throw new Error('个人资料格式错误');
  for (const key of ['compact', 'messageNotifications', 'messagePreview', 'messageSound']) if (typeof input[key] !== 'boolean') throw new Error('偏好设置格式错误');
  const next = { ...user.profile, ...Object.fromEntries(['bio','emoji','color','compact','messageNotifications','messagePreview','messageSound'].map(k=>[k,input[k]])) };
  if (input.avatar !== undefined) {
    if (input.avatar === null) delete next.avatar;
    else {
      if (typeof input.avatar !== 'string' || input.avatar.length > 68000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(input.avatar)) throw new Error('头像需为压缩后的 PNG 或 JPEG 图片');
      const [header, content] = input.avatar.split(','), bytes = Buffer.from(content, 'base64');
      if (bytes.length > 48000 || (header.includes('png') ? bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' : bytes.subarray(0,3).toString('hex') !== 'ffd8ff')) throw new Error('头像图片格式或大小无效');
      next.avatar = input.avatar;
    }
  }
  next.updatedAt = new Date(Math.max(Date.now(), Date.parse(next.updatedAt || 0) + 1 || 0)).toISOString();
  user.displayName = input.displayName.trim(); user.profile = next; return view(user);
}
module.exports = { view, update };
