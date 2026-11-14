// backend/src/academy.js  -  loaded from server.js with:  require('./academy')(app, pool);
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' }));
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };

  // Real public institutions and national bodies. Locations are approximate (used for the 40 km "near me" filter).
  // Accessibility details are NOT verified: the organiser or the community confirms them later.
  const NOTE = 'Accessibility features not confirmed yet. Please check with the institution before you travel, or report what you find.';
  const UNI = 'Has a campus disability support unit. Other accessibility features are not confirmed yet. Please check before you travel.';
  const REAL = [
    ['University of the Witwatersrand (Wits)', 'Educational institution', '1 Jan Smuts Avenue, Braamfontein', 'Johannesburg', 'Gauteng', -26.1929, 28.0305, UNI],
    ['University of Pretoria (Hatfield Campus)', 'Educational institution', 'Lynnwood Road, Hatfield', 'Pretoria', 'Gauteng', -25.7545, 28.2314, UNI],
    ['Tshwane University of Technology (Pretoria Campus)', 'Educational institution', 'Staatsartillerie Road, Pretoria West', 'Pretoria', 'Gauteng', -25.7317, 28.1624, UNI],
    ['Charlotte Maxeke Johannesburg Academic Hospital', 'Hospital', '17 Jubilee Road, Parktown', 'Johannesburg', 'Gauteng', -26.1766, 28.0453, NOTE],
    ['Steve Biko Academic Hospital', 'Hospital', 'Steve Biko Road, Prinshof', 'Pretoria', 'Gauteng', -25.7403, 28.2011, NOTE],
    ['University of Cape Town (Upper Campus)', 'Educational institution', 'Rondebosch', 'Cape Town', 'Western Cape', -33.9577, 18.4611, UNI],
    ['Groote Schuur Hospital', 'Hospital', 'Main Road, Observatory', 'Cape Town', 'Western Cape', -33.9415, 18.4642, NOTE],
    ['Stellenbosch University', 'Educational institution', 'Victoria Street', 'Stellenbosch', 'Western Cape', -33.9321, 18.8602, UNI],
    ['Cape Peninsula University of Technology (Bellville Campus)', 'Educational institution', 'Symphony Road, Bellville', 'Cape Town', 'Western Cape', -33.9326, 18.6429, UNI],
    ['UKZN Howard College Campus', 'Educational institution', 'King George V Avenue, Glenwood', 'Durban', 'KwaZulu-Natal', -29.8665, 30.9803, UNI],
    ['Durban University of Technology (Steve Biko Campus)', 'Educational institution', 'Steve Biko Road, Berea', 'Durban', 'KwaZulu-Natal', -29.8524, 31.0075, UNI],
    ['Inkosi Albert Luthuli Central Hospital', 'Hospital', '800 Bellair Road, Mayville', 'Durban', 'KwaZulu-Natal', -29.8691, 30.9985, NOTE],
    ["Grey's Hospital", 'Hospital', 'Townbush Road', 'Pietermaritzburg', 'KwaZulu-Natal', -29.604, 30.3915, NOTE],
    ['Nelson Mandela University (South Campus)', 'Educational institution', 'University Way, Summerstrand', 'Gqeberha', 'Eastern Cape', -34.0049, 25.667, UNI],
    ['University of Fort Hare (Alice Campus)', 'Educational institution', 'Alice', 'Alice', 'Eastern Cape', -32.7842, 26.8426, UNI],
    ['Walter Sisulu University (Mthatha Campus)', 'Educational institution', 'Nelson Mandela Drive', 'Mthatha', 'Eastern Cape', -31.58, 28.777, UNI],
    ['University of the Free State (Bloemfontein Campus)', 'Educational institution', '205 Nelson Mandela Drive, Park West', 'Bloemfontein', 'Free State', -29.1117, 26.186, UNI],
    ['Central University of Technology', 'Educational institution', '20 President Brand Street', 'Bloemfontein', 'Free State', -29.1186, 26.2099, UNI],
    ['University of Limpopo (Turfloop Campus)', 'Educational institution', 'Sovenga', 'Polokwane', 'Limpopo', -23.8846, 29.7366, UNI],
    ['University of Venda', 'Educational institution', 'University Road', 'Thohoyandou', 'Limpopo', -22.9769, 30.45, UNI],
    ['Pietersburg Provincial Hospital', 'Hospital', 'Hospital Street', 'Polokwane', 'Limpopo', -23.8993, 29.4553, NOTE],
    ['University of Mpumalanga (Mbombela Campus)', 'Educational institution', 'Mbombela', 'Mbombela', 'Mpumalanga', -25.4407, 30.971, UNI],
    ['Rob Ferreira Hospital', 'Hospital', 'Mbombela', 'Mbombela', 'Mpumalanga', -25.4701, 30.9854, NOTE],
    ['North-West University (Potchefstroom Campus)', 'Educational institution', '11 Hoffman Street', 'Potchefstroom', 'North West', -26.6866, 27.0929, UNI],
    ['North-West University (Mahikeng Campus)', 'Educational institution', 'Albert Luthuli Drive, Mmabatho', 'Mahikeng', 'North West', -25.8121, 25.6341, UNI],
    ['Klerksdorp-Tshepong Hospital Complex', 'Hospital', 'Klerksdorp', 'Klerksdorp', 'North West', -26.8578, 26.6643, NOTE],
    ['Sol Plaatje University', 'Educational institution', 'Kimberley', 'Kimberley', 'Northern Cape', -28.738, 24.762, UNI],
    ['Robert Mangaliso Sobukwe Hospital', 'Hospital', 'Kimberley', 'Kimberley', 'Northern Cape', -28.7461, 24.7664, NOTE],
    ['DeafSA (Deaf Federation of South Africa) - national office', 'Support organisation', 'Contact them for the street address', 'Johannesburg', 'Gauteng', -26.2041, 28.0473, 'National organisation for deaf people. Contact them for accessibility details.'],
    ['South African National Council for the Blind (SANCB)', 'Support organisation', 'Contact them for the street address', 'Pretoria', 'Gauteng', -25.7479, 28.2293, 'National organisation for blind and partially sighted people. Contact them for accessibility details.'],
  ];

  const COURSES = [
    {
      title: 'Computer Skills Basics', category: 'Digital skills', pass: 70,
      description: 'Learn the parts of a computer, the keyboard and mouse, files, safe internet use, email and writing a document.',
      lessons: [
        ['Parts of a computer', 'A computer has hardware (the parts you can touch) and software (the programs that run on it). The main hardware parts are the screen (monitor), the keyboard, the mouse, the system unit (the box with the processor and memory) and the speakers.\n\nThe mouse moves the pointer on the screen. The keyboard types letters and numbers. Phones and tablets work in a similar way, but you touch the screen.'],
        ['Using the keyboard and mouse', 'Left-click selects or opens things. Right-click opens a menu of options. Double-click opens a file or a program.\n\nUseful keys: Enter confirms, Backspace deletes the letter before the cursor, Space adds a space and Shift gives you capital letters. Useful shortcuts: Ctrl+C copies, Ctrl+V pastes, Ctrl+Z undoes your last action and Ctrl+S saves. Keyboard shortcuts also help people who cannot use a mouse.'],
        ['Files and folders', 'A file is a document, picture or video saved on the computer. A folder holds files, so you can keep them organised.\n\nSave your work often with Ctrl+S, give files clear names and keep a copy on a USB drive or in cloud storage so you do not lose it.'],
        ['Safe internet and email', 'Use a browser such as Chrome or Edge to visit websites. Never share your password or PIN with anyone. A strong password is long and mixes letters, numbers and symbols.\n\nDo not click links in messages from people you do not know. An email address has a name, the @ sign and a domain, like name@example.com. To send an email you fill in To, Subject and the message, then press Send.'],
        ['Writing a document', 'A word processor such as Microsoft Word or Google Docs is used to write letters, CVs and reports. You can change the font and size, make text bold, add bullet points, and save or print the document.\n\nAlways check your spelling before you send or print your work.'],
      ],
      questions: [
        ['What do we call the parts of a computer that you can touch?', ['Software', 'Hardware', 'A browser', 'An email'], 2],
        ['Which shortcut copies selected text?', ['Ctrl+V', 'Ctrl+Z', 'Ctrl+C', 'Ctrl+S'], 3],
        ['Which key do you hold down to type a capital letter?', ['Enter', 'Backspace', 'Space', 'Shift'], 4],
        ['What does Ctrl+Z do?', ['Saves the file', 'Prints the page', 'Closes the program', 'Undoes your last action'], 4],
        ['What is a folder used for?', ['To hold files', 'To type letters', 'To browse the internet', 'To send emails'], 1],
        ['Which is the strongest password?', ['123456', 'password', 'Tr!ee7Blue#Moon', 'your name'], 3],
        ['What should you do with a link from a stranger?', ['Click it quickly', 'Do not click it', 'Forward it to everyone', 'Reply with your password'], 2],
        ['Which program is used to write a letter?', ['Calculator', 'Media player', 'Word processor', 'Antivirus'], 3],
        ['Which shortcut saves your work?', ['Ctrl+P', 'Ctrl+S', 'Ctrl+X', 'Ctrl+A'], 2],
        ['Which part of an email address separates the name from the domain?', ['A full stop', 'A comma', 'A space', 'The @ sign'], 4],
      ],
    },
    {
      title: 'Communication Skills', category: 'Soft skills', pass: 70,
      description: 'Learn to listen well, write clearly and communicate respectfully with deaf, blind and other people.',
      lessons: [
        ['Why communication matters', 'Good communication helps you at work, at school and in daily life. It means sending a clear message and making sure the other person understands it.\n\nPeople communicate by speaking, writing, signing, using pictures and body language. Every person has the right to communicate in the way that works for them.'],
        ['Listening and understanding', 'Active listening means giving the speaker your full attention, looking at them and checking that you understood by repeating the main point in your own words.\n\nDo not interrupt. If something is not clear, ask a question.'],
        ['Communicating with deaf and hard of hearing people', 'Face the person so they can see your face and lips. Speak normally, not louder and not very slowly. Use gestures, writing, text messages or a typing app if needed.\n\nSouth African Sign Language (SASL) is an official language, and some deaf people prefer to use an interpreter. Never shout, and do not cover your mouth while you speak.'],
        ['Communicating with blind and low vision people', 'Say your name when you greet the person and tell them when you leave. Describe things clearly instead of pointing. Ask before you help, and do not touch a white cane or a guide dog.\n\nGive documents in a format the person can use, such as large print, braille or electronic text.'],
        ['Writing clearly', 'Use short sentences and simple words. Start with the main point. Use headings and bullet points for long messages.\n\nFor emails, write a clear subject, greet the person, say what you need and say thank you.'],
      ],
      questions: [
        ['What is the main goal of communication?', ['To talk as much as possible', 'To send a clear message the other person understands', 'To win an argument', 'To avoid questions'], 2],
        ['What is active listening?', ['Looking at your phone while the person talks', 'Interrupting to give advice', 'Giving full attention and checking you understood', 'Nodding without listening'], 3],
        ['When you talk to a deaf person who lip-reads, you should...', ['Cover your mouth', 'Face the person and speak normally', 'Shout', 'Turn your back'], 2],
        ['South African Sign Language (SASL) is...', ['Only used in schools', 'An official language of South Africa', 'A kind of braille', 'Not a real language'], 2],
        ['When you meet a blind person you should...', ['Say your name and tell them who you are', 'Pull them by the arm', 'Stay silent', 'Touch their cane'], 1],
        ['Which format helps a person with low vision?', ['Tiny grey text', 'Large print or electronic text', 'Pencil handwriting', 'A busy background'], 2],
        ['A clear email subject should...', ['Be empty', 'Tell the reader what the email is about', 'Contain only the word hi', 'Be written in capitals'], 2],
        ['Good written messages use...', ['Short sentences and simple words', 'Long complicated sentences', 'Slang only', 'Many abbreviations'], 1],
      ],
    },
    {
      title: 'Job Readiness: CV, Interview and Workplace Skills', category: 'Employment skills', pass: 70,
      description: 'Write a CV, apply for work, prepare for an interview, behave well at work and manage your money.',
      lessons: [
        ['Writing your CV', 'A CV (curriculum vitae) tells an employer who you are. Include your name and contact details, a short profile, your education, work experience or volunteering, your skills and your references.\n\nKeep it to one or two pages, use a clear font and check your spelling. You do not have to mention a disability on your CV. You decide when and how to share it.'],
        ['Finding and applying for work', 'Look for learnerships, internships and jobs on company websites, government job portals and notice boards. Read the requirements carefully. Send your CV with a short cover letter and follow the instructions.\n\nWhen you are ready, ask the employer about reasonable accommodation, such as an accessible workplace or flexible hours.'],
        ['Preparing for an interview', 'Learn about the company. Practise answers to common questions such as "Tell me about yourself" and "Why do you want this job?". Arrive early and dress neatly. Bring your ID and copies of your documents.\n\nYou can ask for the interview to be arranged in a way that suits you, for example with a sign language interpreter or in an accessible venue.'],
        ['Workplace behaviour', 'Be on time, respect other people, communicate clearly and ask for help when you need it. Keep to deadlines and learn from feedback.\n\nEveryone has the right to a safe and respectful workplace.'],
        ['Managing money', 'Keep a simple budget: write down your income and your expenses. Save a little every month, even a small amount.\n\nAvoid borrowing from unregistered lenders and never share your PIN.'],
      ],
      questions: [
        ['Which of these is usually NOT needed on a CV?', ['Contact details', 'Education', 'A list of your medical details', 'Skills'], 3],
        ['How long should a CV usually be?', ['One or two pages', 'Ten pages', 'Half a line', 'As long as possible'], 1],
        ['Reasonable accommodation means...', ['A discount on lunch', 'Changes that make it possible for you to do the job', 'A free holiday', 'Nothing'], 2],
        ['Before an interview you should...', ['Learn about the company', 'Ignore the job advert', 'Arrive late', 'Forget your documents'], 1],
        ['If you need a sign language interpreter for an interview you should...', ['Cancel the interview', 'Ask the employer in advance', 'Say nothing', 'Bring a stranger'], 2],
        ['A budget lists...', ['Only your friends', 'Only your hobbies', 'Your income and your expenses', 'Passwords'], 3],
        ['Which is good workplace behaviour?', ['Ignoring feedback', 'Shouting at colleagues', 'Missing deadlines', 'Arriving on time and respecting others'], 4],
        ['Who should you share your PIN with?', ['Your friends', 'Nobody', 'Anyone who asks', 'Strangers online'], 2],
      ],
    },
  ];

  (async () => {
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS province TEXT');
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION');
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION');
    await run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
    await run(`CREATE TABLE IF NOT EXISTS courses (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, category TEXT, pass_mark INT DEFAULT 70)`);
    await run(`CREATE TABLE IF NOT EXISTS lessons (id SERIAL PRIMARY KEY, course_id INT REFERENCES courses(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT, video_url TEXT, position INT DEFAULT 1)`);
    await run(`CREATE TABLE IF NOT EXISTS questions (id SERIAL PRIMARY KEY, course_id INT REFERENCES courses(id) ON DELETE CASCADE, question TEXT NOT NULL, options TEXT NOT NULL, answer INT NOT NULL)`);
    await run(`CREATE TABLE IF NOT EXISTS progress (user_id INT REFERENCES users(id) ON DELETE CASCADE, lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE, PRIMARY KEY (user_id, lesson_id))`);
    await run(`CREATE TABLE IF NOT EXISTS attempts (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, course_id INT REFERENCES courses(id) ON DELETE CASCADE, score INT, passed BOOLEAN, created_at TIMESTAMPTZ DEFAULT now())`);
    await run(`CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, user_id INT REFERENCES users(id) ON DELETE SET NULL, course_id INT REFERENCES courses(id) ON DELETE CASCADE, name TEXT, score INT, issued_at TIMESTAMPTZ DEFAULT now())`);

    for (const c of ['first_names TEXT', 'surname TEXT', 'id_type TEXT', 'id_number TEXT']) await run(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS ${c}`);
    const seeded = await run("SELECT 1 FROM settings WHERE key='real_places_v1'");
    if (!seeded.rowCount) {
      await run("DELETE FROM organisations WHERE name LIKE 'Sample %'");
      for (const r of REAL) {
        const ex = await run('SELECT 1 FROM organisations WHERE name=$1', [r[0]]);
        if (!ex.rowCount) await run('INSERT INTO organisations(name,category,address,city,province,lat,lng,accessibility,verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)', r);
      }
      await run("INSERT INTO settings(key,value) VALUES('real_places_v1','1') ON CONFLICT (key) DO NOTHING");
    }
    const have = await run('SELECT 1 FROM courses LIMIT 1');
    if (!have.rowCount) {
      for (const c of COURSES) {
        const { rows } = await run('INSERT INTO courses(title,description,category,pass_mark) VALUES($1,$2,$3,$4) RETURNING id', [c.title, c.description, c.category, c.pass]);
        for (let i = 0; i < c.lessons.length; i++) await run('INSERT INTO lessons(course_id,title,body,position) VALUES($1,$2,$3,$4)', [rows[0].id, c.lessons[i][0], c.lessons[i][1], i + 1]);
        for (const q of c.questions) await run('INSERT INTO questions(course_id,question,options,answer) VALUES($1,$2,$3,$4)', [rows[0].id, q[0], q[1].join('\n'), q[2]]);
      }
    }
  })().catch((e) => console.error('SETUP PROBLEM (academy tables):', e.message || e.code));

  // ---------- Learner side ----------
  app.get('/api/courses', auth, h(async (req, res) => {
    const { rows } = await run(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id=c.id) AS lesson_count,
        (SELECT COUNT(*)::int FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=c.id AND p.user_id=$1) AS done_count,
        (SELECT COUNT(*)::int FROM questions q WHERE q.course_id=c.id) AS question_count,
        (SELECT code FROM certificates ce WHERE ce.course_id=c.id AND ce.user_id=$1 LIMIT 1) AS certificate_code
       FROM courses c ORDER BY c.id`, [req.user.id]);
    res.json(rows);
  }));
  app.get('/api/courses/:id', auth, h(async (req, res) => {
    const course = (await run('SELECT * FROM courses WHERE id=$1', [req.params.id])).rows[0];
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const lessons = (await run(
      `SELECT l.id,l.title,l.body,l.video_url,l.position,(p.lesson_id IS NOT NULL) AS done
       FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_id=$1 ORDER BY l.position, l.id`, [req.params.id, req.user.id])).rows;
    const certificate = (await run('SELECT code,name,first_names,surname,id_type,id_number,score,issued_at FROM certificates WHERE course_id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0] || null;
    const passed = (await run('SELECT 1 FROM attempts WHERE user_id=$1 AND course_id=$2 AND passed LIMIT 1', [req.user.id, req.params.id])).rowCount > 0;
    const qn = (await run('SELECT COUNT(*)::int AS n FROM questions WHERE course_id=$1', [req.params.id])).rows[0].n;
    res.json({ course, lessons, certificate, questionCount: qn, passed });
  }));
  app.post('/api/lessons/:id/complete', auth, h(async (req, res) => {
    await run('INSERT INTO progress VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]); res.json({ ok: true });
  }));
  const allDone = async (courseId, uid) => {
    const total = (await run('SELECT COUNT(*)::int AS n FROM lessons WHERE course_id=$1', [courseId])).rows[0].n;
    const done = (await run('SELECT COUNT(*)::int AS n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=$1 AND p.user_id=$2', [courseId, uid])).rows[0].n;
    return total > 0 && done >= total;
  };
  app.get('/api/courses/:id/exam', auth, h(async (req, res) => {
    if (!(await allDone(req.params.id, req.user.id))) return res.status(400).json({ error: 'Please finish all the lessons first.' });
    const qs = (await run('SELECT id,question,options FROM questions WHERE course_id=$1 ORDER BY id', [req.params.id])).rows;
    if (!qs.length) return res.status(400).json({ error: 'This course has no exam yet.' });
    res.json({ questions: qs.map((q) => ({ id: q.id, question: q.question, options: q.options.split('\n').filter(Boolean) })) });
  }));
  app.post('/api/courses/:id/exam', auth, h(async (req, res) => {
    if (!(await allDone(req.params.id, req.user.id))) return res.status(400).json({ error: 'Please finish all the lessons first.' });
    const course = (await run('SELECT * FROM courses WHERE id=$1', [req.params.id])).rows[0];
    const qs = (await run('SELECT id,answer FROM questions WHERE course_id=$1', [req.params.id])).rows;
    if (!course || !qs.length) return res.status(400).json({ error: 'This course has no exam yet.' });
    const answers = req.body.answers || {};
    const correct = qs.filter((q) => Number(answers[q.id]) === q.answer).length;
    const score = Math.round((correct * 100) / qs.length);
    const passed = score >= (course.pass_mark || 70);
    await run('INSERT INTO attempts(user_id,course_id,score,passed) VALUES($1,$2,$3,$4)', [req.user.id, course.id, score, passed]);
    let code = null;
    if (passed) { const ex = (await run('SELECT code FROM certificates WHERE user_id=$1 AND course_id=$2', [req.user.id, course.id])).rows[0]; if (ex) code = ex.code; }
    res.json({ score, correct, total: qs.length, passed, passMark: course.pass_mark || 70, certificate: code, needsDetails: passed && !code });
  }));
  // South African ID number: 13 digits, a real date of birth and a correct check digit
  const saIdOk = (id) => {
    if (!/^\d{13}$/.test(id)) return false;
    const yy = +id.slice(0, 2); const mm = +id.slice(2, 4); const dd = +id.slice(4, 6);
    const year = yy > new Date().getFullYear() % 100 ? 1900 + yy : 2000 + yy;
    const d = new Date(Date.UTC(year, mm - 1, dd));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;
    let sum = 0;
    for (let i = 0; i < 13; i++) { let n = +id[12 - i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } sum += n; }
    return sum % 10 === 0;
  };
  const NAME_RE = /^[A-Za-z\u00C0-\u024F'’\-. ]{1,80}$/;
  // After passing the exam the learner gives the details that are printed on the certificate
  app.post('/api/courses/:id/certificate', auth, h(async (req, res) => {
    const course = (await run('SELECT * FROM courses WHERE id=$1', [req.params.id])).rows[0];
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const best = (await run('SELECT MAX(score)::int AS s FROM attempts WHERE user_id=$1 AND course_id=$2 AND passed', [req.user.id, course.id])).rows[0].s;
    if (best === null) return res.status(400).json({ error: 'Please pass the exam first.' });
    const have = (await run('SELECT code FROM certificates WHERE user_id=$1 AND course_id=$2', [req.user.id, course.id])).rows[0];
    if (have) return res.json({ certificate: have.code });
    const b = req.body; const first = String(b.first_names || '').trim(); const last = String(b.surname || '').trim();
    const type = ['sa_id', 'passport', 'other'].includes(b.id_type) ? b.id_type : 'sa_id';
    const idn = String(b.id_number || '').replace(/\s/g, '').toUpperCase();
    if (!NAME_RE.test(first) || !NAME_RE.test(last)) return res.status(400).json({ error: 'Please type your full first names and your surname, using letters only.' });
    if (b.consent !== true) return res.status(400).json({ error: 'Please tick the box to confirm your details and agree to them being stored.' });
    if (type === 'sa_id' && !saIdOk(idn)) return res.status(400).json({ error: 'That South African ID number is not valid. It must be 13 digits. Please check it.' });
    if (type !== 'sa_id' && !/^[A-Z0-9-]{5,25}$/.test(idn)) return res.status(400).json({ error: 'Please type a valid passport or document number (5 to 25 letters and numbers).' });
    if ((await run('SELECT 1 FROM certificates WHERE course_id=$1 AND id_number=$2 AND user_id <> $3', [course.id, idn, req.user.id])).rowCount) {
      return res.status(409).json({ error: 'A certificate for this course has already been issued to this ID number.' });
    }
    let code = null;
    for (let i = 0; i < 5 && !code; i++) {
      const c = 'ACC-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      try {
        await run('INSERT INTO certificates(code,user_id,course_id,name,first_names,surname,id_type,id_number,score) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [c, req.user.id, course.id, first + ' ' + last, first, last, type, idn, best]); code = c;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    res.status(201).json({ certificate: code });
  }));
  // Anyone with a certificate number can check it is genuine. The ID number is hidden except the last 4 characters.
  app.get('/api/certificates/:code', h(async (req, res) => {
    const r = (await run(
      `SELECT ce.code, ce.name, ce.id_number, ce.score, ce.issued_at, c.title AS course FROM certificates ce JOIN courses c ON c.id=ce.course_id WHERE ce.code=$1`,
      [String(req.params.code).trim().toUpperCase()])).rows[0];
    if (!r) return res.status(404).json({ error: 'No certificate was found with that number.' });
    const id = r.id_number; delete r.id_number;
    res.json({ ...r, id_masked: id ? '*'.repeat(Math.max(0, id.length - 4)) + id.slice(-4) : null });
  }));

  // ---------- Organiser side: generic add / edit / delete ----------
  const clean = (c, v) => {
    if (c.b) return v === true || v === 'true';
    if (c.n) return v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? (c.def === undefined ? null : c.def) : Number(v);
    return v === undefined || v === null || v === '' ? null : String(v);
  };
  const crud = (path, table, cols, required, order) => {
    app.get(path, auth, admin, h(async (_req, res) => { res.json((await run(`SELECT * FROM ${table} ORDER BY ${order || 'id'}`)).rows); }));
    app.post(path, auth, admin, h(async (req, res) => {
      if (!required.every((k) => req.body[k] !== undefined && String(req.body[k]).trim())) return res.status(400).json({ error: 'Please fill in all required fields' });
      const { rows } = await run(`INSERT INTO ${table}(${cols.map((c) => c.k).join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, cols.map((c) => clean(c, req.body[c.k])));
      if (path === '/api/admin/courses' && app.locals.notify) app.locals.notify.broadcast({ title: 'New course: ' + rows[0].title, body: 'A new free course is ready in the Skills Academy.', url: '/' });
      res.status(201).json(rows[0]);
    }));
    app.put(path + '/:id', auth, admin, h(async (req, res) => {
      if (!required.every((k) => req.body[k] !== undefined && String(req.body[k]).trim())) return res.status(400).json({ error: 'Please fill in all required fields' });
      await run(`UPDATE ${table} SET ${cols.map((c, i) => c.k + '=$' + (i + 1)).join(',')} WHERE id=$${cols.length + 1}`, [...cols.map((c) => clean(c, req.body[c.k])), req.params.id]);
      res.json({ ok: true });
    }));
    app.delete(path + '/:id', auth, admin, h(async (req, res) => { await run(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }));
  };
  const T = (k) => ({ k });
  crud('/api/admin/courses', 'courses', [T('title'), T('description'), T('category'), { k: 'pass_mark', n: true, def: 70 }], ['title']);
  crud('/api/admin/lessons', 'lessons', [{ k: 'course_id', n: true }, T('title'), T('body'), T('video_url'), { k: 'position', n: true, def: 1 }], ['course_id', 'title'], 'course_id, position');
  crud('/api/admin/questions', 'questions', [{ k: 'course_id', n: true }, T('question'), T('options'), { k: 'answer', n: true }], ['course_id', 'question', 'options', 'answer'], 'course_id, id');
  crud('/api/places', 'organisations', [T('name'), T('category'), T('address'), T('city'), T('province'), { k: 'lat', n: true }, { k: 'lng', n: true }, T('phone'), T('email'), T('website'), T('accessibility'), { k: 'verified', b: true }], ['name', 'category'], 'name');

  // ---------- Organiser reports and exports ----------
  app.get('/api/admin/analytics', auth, admin, h(async (_req, res) => {
    const j = async (sql) => (await run(sql)).rows;
    res.json({
      reportsByStatus: await j('SELECT status AS label, COUNT(*)::int AS n FROM accessibility_reports GROUP BY status ORDER BY n DESC'),
      reportsByCategory: await j('SELECT category AS label, COUNT(*)::int AS n FROM accessibility_reports GROUP BY category ORDER BY n DESC'),
      certsByCourse: await j('SELECT c.title AS label, COUNT(ce.id)::int AS n FROM courses c LEFT JOIN certificates ce ON ce.course_id=c.id GROUP BY c.id, c.title ORDER BY n DESC'),
      placesByProvince: await j("SELECT COALESCE(province,'Province not set') AS label, COUNT(*)::int AS n FROM organisations GROUP BY province ORDER BY n DESC"),
      signups: await j("SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS label, COUNT(*)::int AS n FROM users GROUP BY 1 ORDER BY 1 DESC LIMIT 6"),
      exams: (await j('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE passed)::int AS passed FROM attempts'))[0],
      certificates: (await j('SELECT COUNT(*)::int AS n FROM certificates'))[0].n,
    });
  }));
  const EXPORTS = {
    users: 'SELECT id,name,email,role,created_at FROM users ORDER BY id',
    reports: 'SELECT reference,category,place,status,admin_note,created_at,updated_at FROM accessibility_reports ORDER BY id',
    places: 'SELECT id,name,category,address,city,province,lat,lng,phone,email,website,accessibility,verified FROM organisations ORDER BY id',
    certificates: "SELECT ce.code,ce.first_names,ce.surname,ce.id_type,CASE WHEN ce.id_number IS NULL THEN NULL ELSE repeat('*', GREATEST(0, length(ce.id_number) - 4)) || right(ce.id_number, 4) END AS id_number_masked,c.title AS course,ce.score,ce.issued_at FROM certificates ce JOIN courses c ON c.id=ce.course_id ORDER BY ce.id",
    feedback: 'SELECT id,type,message,status,response,created_at FROM feedback ORDER BY id',
  };
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  app.get('/api/admin/export/:what', auth, admin, h(async (req, res) => {
    const sql = EXPORTS[req.params.what];
    if (!sql) return res.status(404).json({ error: 'Unknown export' });
    const rows = (await run(sql)).rows;
    const cols = rows.length ? Object.keys(rows[0]) : [];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.what}.csv"`);
    res.send('\ufeff' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
  }));
};
