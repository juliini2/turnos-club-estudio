const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarReserva,
  hayCruce,
  ordenarReservas,
  leerReservas,
  guardarReservas,
} = require('../script.js');

const existente = {
  id: 'reserva-1', nombre: 'Ana', fecha: '2026-07-18', recurso: 'mesa',
  inicio: '10:00', fin: '11:00', motivo: 'Repasar álgebra',
};

const reserva = (cambios = {}) => ({
  nombre: 'Sol', fecha: '2026-07-18', recurso: 'mesa',
  inicio: '10:30', fin: '11:30', motivo: 'Preparar parcial',
  ...cambios,
});

test('detecta cruces parciales cuando el turno empieza dentro del existente', () => {
  assert.equal(hayCruce(reserva({ inicio: '10:45', fin: '11:15' }), [existente]), true);
});

test('detecta cruces parciales cuando el turno contiene al existente', () => {
  assert.equal(hayCruce(reserva({ inicio: '09:30', fin: '11:30' }), [existente]), true);
});

test('permite turnos consecutivos y del otro recurso', () => {
  assert.equal(hayCruce(reserva({ inicio: '11:00', fin: '12:00' }), [existente]), false);
  assert.equal(hayCruce(reserva({ recurso: 'taller' }), [existente]), false);
});

test('rechaza fechas de calendario inexistentes aunque tengan formato válido', () => {
  assert.match(validarReserva(reserva({ fecha: '2026-02-30' }), []), /fecha/i);
});

test('rechaza campos vacíos y horarios cuyo fin no es posterior al inicio', () => {
  assert.match(validarReserva(reserva({ motivo: '   ' }), []), /complet/i);
  assert.match(validarReserva(reserva({ inicio: '12:00', fin: '12:00' }), []), /posterior/i);
});

test('ordena por fecha y hora conservando el contenido de los campos como texto', () => {
  const posterior = { ...existente, id: 'reserva-2', fecha: '2026-07-19', nombre: '<b>Leo</b>', motivo: 'Texto <script>sin ejecutar</script>' };
  const ordenadas = ordenarReservas([posterior, existente]);
  assert.deepEqual(ordenadas.map((item) => item.id), ['reserva-1', 'reserva-2']);
  assert.equal(ordenadas[1].nombre, '<b>Leo</b>');
  assert.equal(ordenadas[1].motivo, 'Texto <script>sin ejecutar</script>');
});

test('recupera una lista vacía si el JSON guardado está corrupto', () => {
  assert.deepEqual(leerReservas({ getItem: () => '{ roto' }), { reservas: [], corrupto: true });
});

test('no informa guardado cuando localStorage no permite escribir', () => {
  assert.equal(guardarReservas({ setItem() { throw new Error('bloqueado'); } }, []), false);
});

test('rechaza horas fuera de rango y descarta registros almacenados con fechas inválidas', () => {
  assert.match(validarReserva(reserva({ inicio: '25:00', fin: '26:00' }), []), /horario/i);
  const mala = { ...existente, fecha: 'texto' };
  assert.deepEqual(leerReservas({ getItem: () => JSON.stringify([mala]) }), { reservas: [], corrupto: true });
});

test('al cargar conserva la primera reserva válida y descarta cruces y duplicados', () => {
  const solapada = { ...existente, id: 'otra', inicio: '10:30', fin: '12:00' };
  const lectura = leerReservas({ getItem: () => JSON.stringify([existente, solapada, existente]) });
  assert.deepEqual(lectura, { reservas: [existente], corrupto: true });
});

test('mantiene válido un recurso persistido anterior y lo presenta con nombre genérico', () => {
  const { nombreRecurso } = require('../script.js');
  const legado = { ...existente, recurso: 'mesa' };
  assert.equal(validarReserva(legado, []), '');
  assert.equal(nombreRecurso(legado.recurso), 'Atención 1');
});
