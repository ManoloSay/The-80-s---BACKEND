const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
const cron = require('node-cron');
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const request = require('request');
const cheerio = require('cheerio');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://angular-73e5d-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: 'maneldengra@gmail.com',
    pass: 'zcvv knxv sepa dgta'
  },
  debug: true,
  logger: true
});

const app = express();

app.use(bodyParser.json());
app.use(cors());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

//Puerto
const port = 3000;
const server = app.listen(port, () => {
  console.log('Servidor en ejecución en el puerto ', {port});
});

//LoginComponent
app.post('/send-email', (req, res) => {
  const { to_email } = req.body;
  const tokenGenerado = Math.floor(100000 + Math.random() * 900000);
  const htmlTemplate = `
  <div style='font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2'>
  <div style='margin:50px auto;width:70%;padding:20px 0'>

    <div style='border-bottom:1px solid #eee'>
      <a href='' style='font-size:1.4em;color: #00466a;text-decoration:none;font-weight:600'>DEV-Bank</a>
    </div>

    <p style='font-size:1.1em'>Hi,</p>
    <p>Thank you for choosing DEV-Bank. Use the following OTP to complete your Sign Up procedures. OTP is valid for 2 minutes</p>
    <h2 style='background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;'>${tokenGenerado}</h2>
    <p style='font-size:0.9em;'>Regards,<br />DEV-Bank</p>
    <hr style='border:none;border-top:1px solid #eee' />

    <div style='float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300'>
      <p>DEV-Bank Inc</p>
      <p>1600 Inetum Serrallo</p>
      <p>Tarragona</p>
    </div>

  </div>
</div>
`;

  const mailOptions = {
    from: 'maneldengra@gmail.com',
    to: to_email,
    subject: 'DEVBANK',
    text: '',
    html: htmlTemplate
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Error al enviar el correo:', error);
      res.status(500).json({ error: 'Error al enviar el correo' });
    } else {
      console.log('Correo enviado:', info.response);
      const usuariosRef = db.ref('usuarios').push();
      usuariosRef
        .set({ correo: to_email, token: tokenGenerado, registrado: false, zrole: 'user'})
        .then(() => {
          console.log('Documento agregado con éxito');
          res.status(200).json({ tokenGenerado });
        })
        .catch((error) => {
          console.error('Error al agregar el documento:', error);
          res.status(500).json({ error: 'Error al guardar en la base de datos' });
        }); 
    }
  });
});

const io = require('socket.io')(server);
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');

  socket.on('mensaje', (data) => {
    console.log('Mensaje recibido:', data);

    socket.emit('respuesta', 'Mensaje recibido con éxito');
  });
});

//mod
app.post('/check-email', (req, res) => {
  const { email } = req.body;
  const ref = db.ref('usuarios');
  
  ref.orderByChild('correo').equalTo(email).once('value')
    .then(snapshot => {
      const data = snapshot.val();
      
      if (data) {
        const user = Object.values(data)[0];
        const exists = user.registrado === true;
        const role = user.zrole || 'user';

        res.status(200).json({ exists, role });
      } else {
        res.status(200).json({ exists: false });
      }
    })
    .catch(error => {
      console.error('Error al verificar el correo en Firebase:', error);
      res.status(500).json({ error: 'Error al verificar el correo en Firebase' });
    });
});


//registrarse con google


//Tokken
app.use(bodyParser.json());

app.post('/obtener-token', (req, res) => {
  const { email } = req.body;
  const db = admin.database();
  const usuariosRef = db.ref('usuarios');

  usuariosRef.orderByChild('correo').equalTo(email).once('value', (snapshot) => {
    const usuario = snapshot.val();
    if (usuario) {
      const userId = Object.keys(usuario)[0];

      const token = usuario[userId].token;
      res.json({ token });
    } else {
      res.status(404).json({ error: 'Correo electrónico no encontrado' });
    }
  }, (error) => {
    console.error('Error al buscar en la base de datos:', error);
    res.status(500).json({ error: 'Error al buscar en la base de datos' });
  });
});

app.post('/verificar-token-en-servidor', (req, res) => {
  const { token, email } = req.body;
  if (verificarTokenYEmail(token, email)) {
    res.redirect('/login');
  } else {
    res.status(401).json({ error: 'Token inválido o correo no registrado' });
  }
});

app.post('/verificar-token', (req, res) => {
  const token = req.body.token;
  const email = req.body.email;
  const ref = db.ref('usuarios');
  ref.orderByChild('correo').equalTo(email).once('value')
    .then(snapshot => {
      const data = snapshot.val();
      if (data) {
        for (const key in data) {
          if (data.hasOwnProperty(key) && data[key].token === token) {
            const expirationTime = data[key].expirationTime;
            if (currentTime <= expirationTime) {
              return res.json({ message: 'Token válido. Autenticación exitosa' });
            } else {
              ref.child(key).remove();
              return res.status(401).json({ error: 'Token expirado. Solicita uno nuevo.' });
            }
          }
        }
        return res.status(401).json({ error: 'Token inválido. Verifica el token e intenta nuevamente' });
      } else {
        return res.status(404).json({ error: 'Correo no registrado. Regístrate primero' });
      }
    })
    .catch(error => {
      console.error('Error al verificar el token en Firebase:', error);
      res.status(500).json({ error: 'Error al verificar el token en Firebase' });
    });
});

app.post('/update-token', (req, res) => {
  const { email, token } = req.body;
  const ref = db.ref('usuarios');
  ref.orderByChild('correo').equalTo(email).once('value')
    .then(snapshot => {
      const data = snapshot.val();

      if (data) {
        const key = Object.keys(data)[0];
        ref.child(key).update({ token: token })
          .then(() => {
            console.log('Token actualizado correctamente.');
            res.status(200).json({ message: 'Token actualizado correctamente.' });
          })
          .catch((error) => {
            console.error('Error al actualizar el token:', error);
            res.status(500).json({ error: 'Error al actualizar el token en la base de datos' });
          });
      } else {
        res.status(404).json({ error: 'Correo no registrado. Regístrate primero' });
      }
    })
    .catch(error => {
      console.error('Error al verificar el correo en Firebase:', error);
      res.status(500).json({ error: 'Error al verificar el correo en Firebase' });
    });
});

// Ruta para crear un nuevo usuario o actualizar el token
app.post('/create-new-user', (req, res) => {
  const { email, token } = req.body;
  const ref = db.ref('usuarios');
  ref.orderByChild('correo').equalTo(email).once('value')
    .then(snapshot => {
      const data = snapshot.val();

      if (data) {
        const key = Object.keys(data)[0];
        ref.child(key).update({ token: token, registrado: false })
          .then(() => {
            console.log('Token actualizado correctamente.');
            res.status(200).json({ message: 'Token actualizado correctamente.' });
          })
          .catch((error) => {
            console.error('Error al actualizar el token:', error);
            res.status(500).json({ error: 'Error al actualizar el token en la base de datos' });
          });
      } else {
        const usuariosRef = db.ref('usuarios').push();
        usuariosRef
          .set({ correo: email, token: token, registrado: false })
          .then(() => {
            console.log('Nuevo usuario creado en la base de datos.');
            res.status(200).json({ message: 'Nuevo usuario creado en la base de datos.' });
          })
          .catch((error) => {
            console.error('Error al crear el nuevo usuario:', error);
            res.status(500).json({ error: 'Error al crear el nuevo usuario en la base de datos' });
          });
      }
    })
    .catch(error => {
      console.error('Error al verificar el correo en Firebase:', error);
      res.status(500).json({ error: 'Error al verificar el correo en Firebase' });
    });
});

app.get('/obtener-datos-usuario', (req, res) => {
  const { email } = req.query;
  const ref = db.ref('usuarios');
  ref.orderByChild('correo').equalTo(email).once('value')
    .then(snapshot => {
      const data = snapshot.val();

      if (data) {
        const key = Object.keys(data)[0];
        const usuario = data[key];
        res.status(200).json(usuario);
      } else {
        res.status(404).json({ error: 'Correo no registrado' });
      }
    })
    .catch(error => {
      console.error('Error al obtener los datos del usuario:', error);
      res.status(500).json({ error: 'Error al obtener los datos del usuario en Firebase' });
    });
});

module.exports = app;

app.post('/actualizar-registro', (req, res) => {
  const { email } = req.body;
  const usuariosRef = db.ref('usuarios');
  usuariosRef.orderByChild('correo').equalTo(email).once('value')
    .then(snapshot => {
      const data = snapshot.val();
      if (data) {
        const key = Object.keys(data)[0];
        usuariosRef.child(key).update({ registrado: true })
          .then(() => {
            console.log('Registro actualizado correctamente.');
            res.status(200).json({ message: 'Registro actualizado correctamente.' });
          })
          .catch((error) => {
            console.error('Error al actualizar el registro:', error);
            res.status(500).json({ error: 'Error al actualizar el registro en la base de datos' });
          });
      } else {
        res.status(404).json({ error: 'Correo no registrado. Regístrate primero' });
      }
    })
    .catch(error => {
      console.error('Error al verificar el correo en Firebase:', error);
      res.status(500).json({ error: 'Error al verificar el correo en Firebase' });
    });
});

app.post('/scraping-cantantes', (req, res) => {
  const url = 'http://cantantesfamosos.net/';
  request(url, (error, response, html) => {
    if (!error && response.statusCode === 200) {
      const $ = cheerio.load(html);
      $('h3').each((index, element) => {
        console.log($(element).text());
      });
    } else {
      console.error('Error al hacer la solicitud HTTP');
    }
  });
});

//administrador
app.get('/obtener-toda-la-base-de-datos', (req, res) => {
  const ref = db.ref('usuarios');
  ref.once('value')
    .then(snapshot => {
      const data = snapshot.val();
      res.status(200).json(data);
    })
    .catch(error => {
      console.error('Error al obtener toda la base de datos:', error);
      res.status(500).json({ error: 'Error al obtener toda la base de datos en Firebase' });
    });
});

app.delete('/eliminar-usuario/:userId', (req, res) => {
  const userId = req.params.userId;
  const ref = db.ref(`usuarios/${userId}`);

  ref.remove()
    .then(() => {
      console.log('Usuario eliminado correctamente.');
      res.status(200).json({ message: 'Usuario eliminado correctamente.' });
    })
    .catch((error) => {
      console.error('Error al eliminar usuario:', error);
      res.status(500).json({ error: 'Error al eliminar usuario en la base de datos' });
    });
});

app.put('/actualizar-usuario/:userId', (req, res) => {
  const userId = req.params.userId;
  const updatedUserData = req.body;
  const ref = db.ref(`usuarios/${userId}`);
  ref.update(updatedUserData)
    .then(() => {
      console.log('Usuario actualizado correctamente.');
      res.status(200).json({ message: 'Usuario actualizado correctamente.' });
    })
    .catch((error) => {
      console.error('Error al actualizar usuario:', error);
      res.status(500).json({ error: 'Error al actualizar usuario en la base de datos' });
    });
});

app.post('/agregar-usuario', (req, res) => {
  const nuevoUsuario = req.body;
  const correoNuevoUsuario = nuevoUsuario.correo;
  const ref = db.ref('usuarios');
  ref.orderByChild('correo').equalTo(correoNuevoUsuario).once('value')
    .then(snapshot => {
      const data = snapshot.val();
      if (data) {
        console.log('Correo electrónico ya registrado:', correoNuevoUsuario);
        res.status(400).json({ error: 'El correo electrónico ya está registrado' });
      } else {
        const usuariosRef = db.ref('usuarios').push();
        usuariosRef
          .set(nuevoUsuario)
          .then(() => {
            console.log('Usuario agregado a la base de datos con éxito');
            res.status(200).json({ message: 'Usuario agregado con éxito' });
          })
          .catch((error) => {
            console.error('Error al agregar usuario a la base de datos:', error);
            res.status(500).json({ error: 'Error al agregar usuario a la base de datos' });
          });
      }
    })
    .catch(error => {
      console.error('Error al verificar el correo en Firebase:', error);
      res.status(500).json({ error: 'Error al verificar el correo en Firebase' });
    });
});

//artistas
