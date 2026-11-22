// backend/src/policy.js  -  rules for passwords. Used when people register, reset or change a password.
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'password1234', '1234567890', '12345678910', 'qwerty12345', 'qwertyuiop1', 'iloveyou123', 'admin12345', 'welcome1234', 'letmein1234',
  'abc1234567', 'abcd123456', 'passw0rd123', 'changeme123', 'south africa1', 'southafrica1', 'johannesburg1', 'capetown123', 'monkey12345', 'football123', 'dragon12345', 'sunshine123']);

exports.passwordProblem = (pw, email = '') => {
  const p = String(pw || '');
  if (p.length < 10) return 'Your password must be at least 10 characters long.';
  if (p.length > 128) return 'Your password is too long (the limit is 128 characters).';
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij)/.test(low)) return 'That password is too easy to guess. Please choose a different one.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Your password must not contain the first part of your email address.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Please use both letters and numbers in your password.';
  return null;
};
