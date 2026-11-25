'use strict';

const CLAVE_RESERVAS = 'entre-lineas-ronda-reservas-v1';
const RECURSOS = ['mesa', 'taller'];

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function validarReserva(datos, reservas = []) {
  const requeridos = ['nombre', 'fecha', 'recurso', 'inicio', 'fin', 'motivo'];
  if (!datos || requeridos.some((campo) => typeof datos[campo] !== 'string' || !datos[campo].trim())) {
    return 'Completá todos los campos para reservar.';
  }
  if (!fechaValida(datos.fecha)) return 'Ingresá una fecha válida.';
  if (!RECURSOS.includes(datos.recurso)) return 'Elegí uno de los espacios disponibles.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.fin)) return 'Revisá el horario ingresado.';
  if (datos.fin <= datos.inicio) return 'La hora de fin debe ser posterior al inicio.';
  if (hayCruce(datos, reservas)) return 'Ese espacio ya tiene una ronda en ese horario.';
  return '';
}

function hayCruce(nueva, reservas) {
  return reservas.some((existente) => existente.fecha === nueva.fecha
    && existente.recurso === nueva.recurso
    && nueva.inicio < existente.fin
    && nueva.fin > existente.inicio);
}

function ordenarReservas(reservas) {
  return [...reservas].sort((a, b) => `${a.fecha}T${a.inicio}`.localeCompare(`${b.fecha}T${b.inicio}`));
}

function leerReservas(almacenamiento) {
  try {
    const texto = almacenamiento.getItem(CLAVE_RESERVAS);
    if (!texto) return { reservas: [], corrupto: false };
    const datos = JSON.parse(texto);
    if (!Array.isArray(datos)) return { reservas: [], corrupto: true };
    const reservas = [];
    for (const item of datos) {
      if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()
        && !reservas.some((guardada) => guardada.id === item.id)
        && !validarReserva(item, reservas)) reservas.push(item);
    }
    return { reservas, corrupto: reservas.length !== datos.length };
  } catch {
    return { reservas: [], corrupto: true };
  }
}

function guardarReservas(almacenamiento, reservas) {
  try {
    almacenamiento.setItem(CLAVE_RESERVAS, JSON.stringify(reservas));
    return true;
  } catch {
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validarReserva, hayCruce, ordenarReservas, leerReservas, guardarReservas, fechaValida, CLAVE_RESERVAS };
}

if (typeof document !== 'undefined') {
  const formulario = document.getElementById('formulario-reserva');
  const aviso = document.getElementById('aviso');
  const agenda = document.getElementById('agenda');
  const comprobante = document.getElementById('comprobante');
  let almacenamiento;
  let reservas = [];
  let reservaVigente = null;

  function anunciar(mensaje, tipo = '') {
    aviso.textContent = mensaje;
    aviso.className = tipo ? `aviso ${tipo}` : 'aviso';
  }

  function nombreRecurso(valor) {
    return valor === 'mesa' ? 'Mesa de lectura' : 'Taller de ejercicios';
  }

  function fechaLegible(valor) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, dia)));
  }

  function actualizarAgenda() {
    agenda.replaceChildren();
    const lista = ordenarReservas(reservas);
    if (!lista.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacia';
      vacio.textContent = 'Todavía no hay rondas. La primera puede ser la tuya.';
      agenda.append(vacio);
      return;
    }
    for (const item of lista) {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'turno';
      const titulo = document.createElement('h3');
      titulo.textContent = `${nombreRecurso(item.recurso)} · ${item.inicio} a ${item.fin}`;
      const fecha = document.createElement('p');
      fecha.textContent = fechaLegible(item.fecha);
      const participante = document.createElement('p');
      participante.textContent = `Ronda de ${item.nombre}`;
      const tema = document.createElement('p');
      tema.textContent = item.motivo;
      const cancelar = document.createElement('button');
      cancelar.type = 'button';
      cancelar.className = 'boton-secundario';
      cancelar.textContent = 'Cancelar ronda';
      cancelar.setAttribute('aria-label', `Cancelar la ronda de ${item.nombre}, ${fechaLegible(item.fecha)} a las ${item.inicio}`);
      cancelar.addEventListener('click', () => cancelarReserva(item.id));
      tarjeta.append(titulo, fecha, participante, tema, cancelar);
      agenda.append(tarjeta);
    }
  }

  function mostrarComprobante(item) {
    const contenedor = comprobante.querySelector('.detalles-comprobante');
    contenedor.replaceChildren();
    const detalles = [
      ['Participante', item.nombre], ['Día', fechaLegible(item.fecha)],
      ['Horario', `${item.inicio} a ${item.fin}`], ['Espacio', nombreRecurso(item.recurso)], ['Tema', item.motivo],
    ];
    for (const [etiqueta, valor] of detalles) {
      const linea = document.createElement('p');
      const fuerte = document.createElement('strong');
      fuerte.textContent = `${etiqueta}: `;
      linea.append(fuerte, document.createTextNode(valor));
      contenedor.append(linea);
    }
    comprobante.hidden = false;
  }

  function sincronizarAgenda() {
    reservas = leerReservas(almacenamiento).reservas;
    if (reservaVigente && !reservas.some((item) => item.id === reservaVigente.id)) {
      reservaVigente = null;
      comprobante.hidden = true;
      comprobante.querySelector('.detalles-comprobante').replaceChildren();
    }
    actualizarAgenda();
  }

  window.addEventListener('storage', (evento) => {
    if (evento.key === CLAVE_RESERVAS || evento.key === null) sincronizarAgenda();
  });

  function cancelarReserva(id) {
    sincronizarAgenda();
    const siguientes = reservas.filter((item) => item.id !== id);
    if (!guardarReservas(almacenamiento, siguientes)) {
      anunciar('No se pudo guardar el cambio. Revisá el almacenamiento del navegador e intentá de nuevo.', 'error');
      return;
    }
    reservas = siguientes;
    if (reservaVigente?.id === id) {
      reservaVigente = null;
      comprobante.hidden = true;
      comprobante.querySelector('.detalles-comprobante').replaceChildren();
    }
    actualizarAgenda();
    anunciar('La ronda se canceló.', 'exito');
  }

  try {
    almacenamiento = window.localStorage;
    const lectura = leerReservas(almacenamiento);
    reservas = lectura.reservas;
    if (lectura.corrupto) anunciar('Se descartaron datos de agenda dañados. Las reservas válidas siguen disponibles.', 'error');
  } catch {
    almacenamiento = { getItem() { throw new Error('Almacenamiento bloqueado'); }, setItem() { throw new Error('Almacenamiento bloqueado'); } };
    anunciar('El almacenamiento del navegador está bloqueado. Podés consultar la agenda, pero no guardar cambios.', 'error');
  }

  actualizarAgenda();
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    reservaVigente = null;
    comprobante.hidden = true;
    comprobante.querySelector('.detalles-comprobante').replaceChildren();
    sincronizarAgenda();
    const datos = Object.fromEntries(new FormData(formulario).entries());
    const error = validarReserva(datos, reservas);
    if (error) {
      anunciar(error, 'error');
      return;
    }
    const nueva = { ...datos, id: `ronda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    const siguientes = [...reservas, nueva];
    if (!guardarReservas(almacenamiento, siguientes)) {
      anunciar('No se pudo guardar la ronda. Revisá el almacenamiento del navegador e intentá de nuevo.', 'error');
      return;
    }
    reservas = siguientes;
    reservaVigente = nueva;
    actualizarAgenda();
    mostrarComprobante(nueva);
    anunciar('Tu ronda quedó guardada. Acá tenés el comprobante.', 'exito');
    formulario.reset();
    document.getElementById('nombre').focus();
  });

  document.getElementById('imprimir-comprobante').addEventListener('click', () => {
    if (!reservaVigente || comprobante.hidden) return;
    document.body.classList.add('imprimiendo-comprobante');
    window.print();
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-comprobante'));
}
