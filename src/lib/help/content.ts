/**
 * In-app help content (ES / EN).
 * Structured for a searchable, collapsible help center.
 */

export type HelpBullet = {
  title: string;
  body: string;
};

export type HelpSection = {
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
  bullets?: HelpBullet[];
  tips?: string[];
  /** Sidebar route, if any */
  href?: string;
};

export type HelpGroup = {
  id: string;
  title: string;
  description: string;
  sections: HelpSection[];
};

export type HelpContent = {
  intro: string;
  groups: HelpGroup[];
};

const es: HelpContent = {
  intro:
    "Esta guía explica cada pantalla y opción de MisFinanzas Familiar. Úsala como manual del hogar: desde registrar un gasto hasta configurar quién ve qué. Algunas secciones solo aparecen si un administrador te dio acceso a ese módulo.",
  groups: [
    {
      id: "start",
      title: "Primeros pasos",
      description: "Cómo está organizado el hogar y qué hace cada rol.",
      sections: [
        {
          id: "overview",
          title: "Qué es MisFinanzas Familiar",
          summary: "Un hogar compartido con cuentas, presupuestos y permisos por persona.",
          paragraphs: [
            "MisFinanzas Familiar es una app de finanzas del hogar. Un “hogar” reúne a varias personas (pareja, hijos, familiares) que comparten o ven parte de las finanzas.",
            "Los datos viven en el servidor del hogar. Cada persona entra con su propia cuenta y una llave de acceso (passkey: Face ID, huella o llave de seguridad). No se usan contraseñas.",
            "Lo que cada uno ve depende de su rol y de la política de seguridad que configure un administrador.",
          ],
          bullets: [
            {
              title: "Dueño (owner)",
              body: "Crea el hogar. Siempre tiene acceso total. Puede quitar a cualquiera y gestionar seguridad.",
            },
            {
              title: "Admin",
              body: "Casi el mismo poder que el dueño: invita, cambia roles (excepto dueño), define políticas de visibilidad y ve todo.",
            },
            {
              title: "Miembro",
              body: "Usa la app según los módulos y restricciones que le den. Puede registrar movimientos si se lo permiten.",
            },
            {
              title: "Solo lectura (viewer)",
              body: "Normalmente ve información limitada y no debería modificar finanzas (según la política).",
            },
          ],
          tips: [
            "Si no ves una opción del menú, es porque tu política de seguridad oculta ese módulo. Pídele a un admin que lo active o te explique el motivo.",
            "Los admins y el dueño siempre ven todo, aunque la política guardada diga otra cosa.",
          ],
        },
        {
          id: "navigation",
          title: "Menú, idioma y sesión",
          summary: "Barra lateral, ES/EN, “Ponerme al día” y cerrar sesión.",
          paragraphs: [
            "La barra lateral lista las pantallas a las que tienes acceso. En el móvil se abre con el botón de menú.",
            "Abajo del menú puedes cambiar el idioma (ES / EN). El formato de moneda del hogar se define en Ajustes (solo admin/dueño).",
            "“Ponerme al día” abre el resumen del inicio con el asistente de catch-up para revisar lo que pasó desde tu última visita.",
            "Cerrar sesión borra datos offline locales del dispositivo y termina la sesión en el servidor cuando hay conexión.",
          ],
          tips: [
            "La app funciona en parte sin internet: abre cada pantalla una vez en línea para que quede cacheada.",
            "Si estás offline, verás un aviso y los cambios se sincronizan al volver la conexión.",
          ],
        },
        {
          id: "passkeys",
          title: "Inicio de sesión con passkeys",
          summary: "Face ID, huella o llave física — sin contraseña.",
          paragraphs: [
            "Al crear el hogar o unirte por invitación, registras una passkey en el dispositivo. Esa es tu forma de entrar.",
            "Puedes registrar más llaves en Seguridad (sección de passkeys) por si usas varios dispositivos.",
            "Si pierdes el acceso a todas tus llaves, un admin del hogar no puede “resetear contraseña”; necesitarás un flujo de recuperación o re-invitación según cómo esté desplegada la app.",
          ],
          href: "/security",
        },
      ],
    },
    {
      id: "daily",
      title: "Día a día",
      description: "Resumen, cuentas, movimientos y presupuestos del hogar.",
      sections: [
        {
          id: "dashboard",
          title: "Inicio (resumen)",
          summary: "Ingresos, gastos, balance, alertas y actividad reciente del periodo.",
          href: "/",
          paragraphs: [
            "Es la pantalla de aterrizaje. Resume el mes (o el periodo visible) con totales de ingresos, gastos y balance, según lo que tu política permita mostrar.",
            "Suele incluir: franja de saldos por cuenta, top de gastos por categoría, tarjetas de crédito, alertas de presupuesto (cerca o excedido) y las últimas transacciones.",
            "Desde Inicio puedes pulsar “Nuevo movimiento” para abrir el formulario de captura sin pasar por el menú.",
            "Si un admin ocultó ingresos o saldos para tu perfil, esos bloques no aparecen o se muestran vacíos a propósito.",
          ],
          tips: [
            "Úsala para un vistazo rápido; el detalle está en Movimientos, Presupuestos y Tarjetas.",
          ],
        },
        {
          id: "accounts",
          title: "Cuentas",
          summary: "Cuentas compartidas, saldo, transferencias y cuentas Personales privadas.",
          href: "/accounts",
          paragraphs: [
            "Aquí gestionas las cuentas del hogar: efectivo, cheques, débito, ahorro u otras. Cada una tiene nombre, tipo, icono y saldo.",
            "Al crear una cuenta puedes indicar un saldo inicial. Ese saldo se actualiza con ingresos, gastos y transferencias.",
            "Transferir mueve dinero entre dos cuentas del hogar (sin crear un “gasto” de consumo). Es la forma correcta de fondear la bolsa personal de un miembro.",
            "Cada miembro tiene (o se le crea) una cuenta Personal privada. Solo el dueño de esa cuenta y los admins la ven. Las transferencias hacia ella son el “sueldo” o mesada de la quincena en Presupuestos personales.",
          ],
          bullets: [
            {
              title: "Nueva cuenta",
              body: "Nombre, tipo y saldo inicial. Las cuentas compartidas no tienen dueño; las personales están ligadas a un usuario.",
            },
            {
              title: "Transferir",
              body: "Elige origen, destino y monto. El saldo de una baja y el de la otra sube el mismo día.",
            },
            {
              title: "Eliminar",
              body: "Solo si no es una cuenta personal del sistema y si la política/reglas lo permiten. Revisa que no dejes movimientos huérfanos.",
            },
          ],
          tips: [
            "Para dar dinero personal a alguien: Cuentas → Transferir → hacia “Personal · Nombre”. Eso alimenta su pantalla de presupuestos personales.",
            "Las cuentas personales no se deben borrar: son la caja privada de cada quien.",
          ],
        },
        {
          id: "transactions",
          title: "Movimientos",
          summary: "Ingresos, gastos y pagos con una o varias fuentes (cuenta y/o tarjeta).",
          href: "/transactions",
          paragraphs: [
            "Registro de la actividad financiera del hogar. Filtra por periodo y revisa quién gastó, la categoría y con qué se pagó.",
            "Al crear un gasto puedes pagar con una o varias fuentes: combinar cuentas y tarjetas de crédito. La suma de los montos de pago debe igualar el total del movimiento.",
            "Si eliges tarjeta de crédito, el gasto no reduce el saldo de una cuenta bancaria el mismo día: queda en el ciclo de la tarjeta. Opcionalmente puedes marcar MSI (meses sin intereses) para repartir el cargo en cuotas.",
            "“Quién gastó” asocia el movimiento a un miembro (útil para mesadas, reportes y políticas “solo lo mío”).",
            "Filtra la lista por quién gastó, categoría, cuenta o tarjeta, y un rango de monto (además del mes). Los filtros vienen cerrados; ábrelos cuando los necesites.",
          ],
          bullets: [
            {
              title: "Ingreso",
              body: "Suma saldo a la cuenta elegida. Ideal para nómina, reembolsos, etc.",
            },
            {
              title: "Gasto",
              body: "Con cuenta: baja el saldo. Con tarjeta: se acumula al ciclo de la tarjeta. Con ambos: divide el monto.",
            },
            {
              title: "Transferencia",
              body: "Mejor usar la acción Transferir en Cuentas para no confundirlas con gastos.",
            },
            {
              title: "MSI",
              body: "Solo aplica con tarjeta. Genera un plan de pagos mensuales que verás en Recurrentes, detalle de tarjeta y ¿Cuánto gastar?",
            },
          ],
          tips: [
            "Si un gasto se paga mitad efectivo y mitad tarjeta, usa “Agregar otra forma de pago” y reparte el monto.",
            "Editar o borrar un movimiento también puede ajustar saldos y planes MSI vinculados.",
          ],
        },
        {
          id: "budgets",
          title: "Presupuestos",
          summary: "Límites por categoría en quincenas (1–15 y 16–fin de mes).",
          href: "/budgets",
          paragraphs: [
            "Controla cuánto planeas gastar por categoría. El periodo del hogar usa dos quincenas al mes: del 1 al 15 y del 16 al fin de mes.",
            "Cada presupuesto muestra gastado vs límite. Si te pasas, verás alerta (también en el inicio).",
            "Puedes copiar la quincena anterior, guardar una plantilla default y aplicarla a este periodo, a ambas quincenas del mes, o al año siguiente.",
            "Durante la quincena puedes enviar restante de una categoría a una meta (no mueve saldos de cuentas; solo baja el restante del presupuesto y sube el progreso). Al terminar (día 15 o último día del mes) cierra el periodo: el sobrante puede ir a emergencia de la siguiente quincena, a otra categoría, a una meta, o marcarse gastado.",
            "Las quincenas ya pasadas se cierran por defecto sin efecto futuro: no tocan el presupuesto actual ni los saldos. Así evitas que un cierre viejo “empuje” sobrante al periodo de hoy.",
            "La opción “Reservar presupuestos” en ¿Cuánto gastar? aparta lo no gastado del presupuesto y del fondo de emergencia (como si lo fueras a gastar todo), más las quincenas futuras. Un periodo cerrado ya no arrastra sobrante implícito.",
          ],
          bullets: [
            {
              title: "Solo esta quincena",
              body: "Afecta únicamente el periodo que estás viendo.",
            },
            {
              title: "Plantilla default",
              body: "Se aplica sola cuando un periodo queda vacío, para no reescribir todo cada mes.",
            },
            {
              title: "Año siguiente",
              body: "Propaga el default a las 24 quincenas del siguiente año (útil al planificar).",
            },
            {
              title: "Cierre y destinos",
              body: "Elige destino por categoría. Emergencia es un colchón, no un límite más grande. Marcar gastado cierra la quincena sin mover nada adelante. Enviar a una meta (en el cierre o con “A meta” durante la quincena) suma progreso sin mover saldos de cuentas.",
            },
          ],
        },
      ],
    },
    {
      id: "cards-recurring",
      title: "Tarjetas y recurrentes",
      description: "Ciclos de corte, pagos, MSI e ingresos fijos.",
      sections: [
        {
          id: "credit-cards",
          title: "Tarjetas de crédito",
          summary: "Corte, días de gracia, ciclos a pagar y detalle de cargos/MSI.",
          href: "/credit-cards",
          paragraphs: [
            "Cada tarjeta tiene día de corte y días de gracia. Con eso la app calcula el ciclo en curso, el próximo pago y el siguiente ciclo.",
            "En la lista ves gasto del mes, montos a pagar y un acceso a pagos pendientes. Al entrar al detalle de una tarjeta ves cargos, planes MSI y puedes editar o eliminar.",
            "Al eliminar un cargo MSI te pregunta si quitas solo ese mes o todo el plan. Eso evita borrar por error un financiamiento completo.",
            "Para pagar la tarjeta pulsa Pagar y elige la cuenta de origen. Ese movimiento nunca se crea solo: baja el saldo de la cuenta y lo pendiente del ciclo. ¿Cuánto gastar? solo proyecta lo que aún no has pagado.",
          ],
          bullets: [
            {
              title: "Día de corte",
              body: "Cierra el ciclo de compras. Ejemplo: corte día 15.",
            },
            {
              title: "Días de gracia",
              body: "Días después del corte para pagar sin caer en mora según tu configuración (ej. 20 días → fecha de pago ≈ corte + gracia).",
            },
            {
              title: "Próximo pago / Siguiente ciclo",
              body: "Montos y fechas que la app proyecta para que sepas cuándo y cuánto sale de tus cuentas.",
            },
          ],
          tips: [
            "Configura bien corte y gracia: de eso depende ¿Cuánto gastar? y los recordatorios de pago.",
            "Cargos “fantasma” de un gasto ya borrado se pueden limpiar en el detalle de la tarjeta.",
          ],
        },
        {
          id: "recurring",
          title: "Recurrentes",
          summary: "Ingresos fijos, pagos del mes (Spotify, internet) y planes MSI.",
          href: "/recurring",
          paragraphs: [
            "Ingresos recurrentes (nómina, pensión, etc.) se proyectan en ¿Cuánto gastar? según el día del mes que indiques.",
            "Los pagos recurrentes (Spotify, internet, renta) se registran solos ese día en la cuenta o tarjeta que elijas. Al crear o editar un gasto, marca “Repetir cada mes”.",
            "La sección de MSI lista los planes diferidos activos creados al registrar gastos con MSI en tarjeta o al importar un estado de cuenta.",
            "No confundas un ingreso o pago recurrente (plantilla) con el movimiento ya contado: el recurrente es la regla; el cargo o depósito real aparece en Movimientos cuando llega o se auto-registra.",
          ],
        },
      ],
    },
    {
      id: "planning",
      title: "Planificación",
      description: "Deudas, metas, retiro, flujo de caja y bolsas personales.",
      sections: [
        {
          id: "debts",
          title: "Deudas",
          summary: "Préstamos con capital, interés y pagos registrados.",
          href: "/debts",
          paragraphs: [
            "Registra deudas con principal, tasa anual, pago mensual sugerido y día de pago.",
            "Cada deuda muestra cómo se parte el próximo pago (intereses vs capital) y cuántos intereses pagarías si sigues con ese monto.",
            "Puedes probar otro pago mensual y ver al instante si ahorras intereses o tardas más. Al registrar un pago, los intereses de ese mes se calculan sobre el saldo.",
            "Los saldos de deuda pueden ocultarse por política de seguridad para miembros que no deban verlos.",
          ],
        },
        {
          id: "goals",
          title: "Metas de ahorro",
          summary: "Objetivos con aportes desde una cuenta o el restante del presupuesto.",
          href: "/goals",
          paragraphs: [
            "Defines una meta (vacaciones, enganche, emergencia) con monto objetivo.",
            "Puedes aportar desde una cuenta (baja el saldo) o desde el restante de una categoría del presupuesto de la quincena (no mueve cuentas; reduce lo que queda por gastar ahí).",
            "Al cerrar la quincena también puedes enviar sobrante a metas. Deshacer una reserva de cuenta reintegra el saldo; deshacer un aporte de presupuesto solo baja el progreso (si la quincena no está cerrada).",
          ],
          tips: [
            "Las reservas de metas pueden incluirse en el cálculo del plan de retiro si activas esa opción.",
          ],
        },
        {
          id: "retirement",
          title: "Plan de retiro",
          summary: "Proyección educativa: capital necesario, aportaciones e inflación.",
          href: "/retirement",
          paragraphs: [
            "Simulador de largo plazo: edades, gasto deseado en retiro, rendimientos, inflación, SWR (tasa de retiro seguro), pensión e ingresos extra.",
            "Puedes basar el ahorro actual en saldos del hogar y/o metas, o capturarlo a mano. Ajusta aportación mensual y crecimiento de aportaciones.",
            "Incluye tasas de referencia de instrumentos en México (CETES, Bonos M, Udibonos, TIIE, AFORE, inflación) agrupadas por país. Se actualizan solas el día 1 de cada mes.",
            "Muestra si vas “en buen camino” o con brecha, mensualidad sugerida para cerrarla, gráfica y tabla año a año.",
            "Es una estimación educativa, no asesoría financiera formal.",
          ],
        },
        {
          id: "safe-to-spend",
          title: "¿Cuánto gastar?",
          summary: "Laboratorio de flujo de caja con proyección, metas y escenarios.",
          href: "/safe-to-spend",
          paragraphs: [
            "Responde “¿cuánto puedo gastar hoy sin romper el flujo?” combinando saldos de cuentas (todas o una), ingresos futuros, pagos de tarjetas, MSI, deudas y, opcionalmente, presupuestos no gastados.",
            "Modos: Panorama (visión general), Proyectar a una fecha, y ¿Cuándo tendré X? (meta de saldo).",
            "Escenarios hipotéticos: agrega gastos o ingresos simulados sin guardarlos en la contabilidad real.",
            "“Incluir ingresos futuros” usa recurrentes y proyecciones. “Reservar presupuestos” aparta lo presupuestado aún no gastado (incl. quincenas futuras con default).",
            "Las compras con tarjeta no restan el banco el día de la compra; el impacto aparece en las fechas de pago del ciclo / MSI.",
          ],
          tips: [
            "Si el saldo mínimo proyectado es negativo, baja el “seguro para gastar” o mueve fechas en escenarios.",
            "Cambia horizonte (días, hasta 2 años) para ver más o menos futuro.",
          ],
        },
        {
          id: "personal",
          title: "Presupuestos personales",
          summary: "Bolsa privada por quincena: transferencias + ingresos extra − gastos personales.",
          href: "/personal",
          paragraphs: [
            "Cada miembro tiene su propia “bolsa” para la quincena. Ya no se edita una asignación a mano: se fondea con transferencias reales a su cuenta Personal.",
            "Disponible ≈ transferencias recibidas en el periodo + ingresos extra registrados − gastos personales del periodo (y se refleja el saldo de la cuenta personal).",
            "Puedes crear presupuestos personales (café, hobbies…) y registrar gastos contra ellos.",
            "Los admins pueden ver o enfocar la bolsa de otro miembro para ayudar a administrarla.",
          ],
          tips: [
            "Flujo típico: el admin transfiere desde la cuenta del hogar a Personal · Ana → Ana ve el disponible y gasta con su presupuesto personal.",
          ],
        },
      ],
    },
    {
      id: "tools",
      title: "Herramientas",
      description: "Tickets, importar MSI y respaldos cifrados.",
      sections: [
        {
          id: "tickets",
          title: "Tickets / recibos",
          summary: "Adjunta o registra comprobantes ligados a tus finanzas.",
          href: "/tickets",
          paragraphs: [
            "Espacio para tickets y recibos del hogar: útil para guardar evidencia de gastos o compras a revisar.",
            "Puede requerir conexión según el tamaño de archivos. Si no ves el menú, el módulo está desactivado en tu política.",
          ],
        },
        {
          id: "import-statement",
          title: "Estado de cuenta",
          summary: "Detecta MSI en texto/PDF de estado de cuenta y créalos en una tarjeta.",
          href: "/import-statement",
          paragraphs: [
            "Pegas o subes el texto de un estado (p. ej. Banamex con MSI). La app detecta líneas de meses sin intereses.",
            "Revisas lo detectado, eliges la tarjeta destino e importas los seleccionados. Se crean planes MSI visibles en tarjetas y recurrentes.",
          ],
        },
        {
          id: "import-export",
          title: "Importar / Exportar",
          summary: "Respaldo cifrado del hogar (.enc) o restauración (admin).",
          href: "/import-export",
          paragraphs: [
            "Exportar genera un archivo cifrado con contraseña. Sin esa contraseña no se puede recuperar el respaldo.",
            "Importar (admin/dueño) puede fusionar datos o reemplazar todo. Reemplazar es destructivo: úsalo solo si estás seguro.",
            "La política de seguridad puede ocultar exportar a ciertos miembros (showExport).",
          ],
          tips: [
            "Guarda la contraseña del respaldo en un lugar seguro, fuera del archivo.",
          ],
        },
      ],
    },
    {
      id: "family-security",
      title: "Familia y seguridad",
      description: "Invitaciones, roles, políticas de visibilidad e impersonación.",
      sections: [
        {
          id: "family",
          title: "Familia",
          summary: "Miembros, invitaciones, reenvío y actividad reciente.",
          href: "/family",
          paragraphs: [
            "Lista de miembros con su rol. Los admins pueden cambiar roles (no el del dueño) y quitar miembros (con reglas: solo el dueño quita admins).",
            "Invitar crea un enlace por correo/rol. Compártelo por WhatsApp, SMS o copiar. La persona crea su cuenta con ese correo y se une sin crear otro hogar.",
            "Invitaciones pendientes: reenviar genera un enlace nuevo y alarga la vigencia; no cambia el rol ni la política de seguridad ya configurada. Revocar invalida el enlace.",
            "Actividad reciente muestra un registro de acciones importantes del hogar.",
          ],
          tips: [
            "Configura permisos de la invitación en Seguridad antes de que la persona se una, o reenvía el mismo enlace de políticas sin tocarlas.",
          ],
        },
        {
          id: "security",
          title: "Seguridad (quién ve qué)",
          summary: "Niveles de acceso, categorías ocultas, plantillas, ver como y passkeys.",
          href: "/security",
          paragraphs: [
            "Solo dueño y admin. Elige un miembro o una invitación pendiente y define su política.",
            "Paso 1: a quién. Paso 2: nivel — Acceso completo, Limitado o Solo gastos. Paso 3: ocultar categorías (afecta movimientos y presupuestos de esa categoría).",
            "Puedes copiar la política de otro miembro al editor (sin guardar hasta que pulses Guardar). En plantillas, guarda la política actual o crea una plantilla desde un miembro existente y aplícala a varios de golpe.",
            "“Ver como este miembro / invitación” te muestra la app con sus permisos reales (impersonación de lectura). Sal de esa vista para volver a administrar.",
            "Ajustes avanzados: módulos pantalla por pantalla, ingresos/gastos/transferencias, saldos, solo propios movimientos, ocultar cuentas o tarjetas concretas, etc.",
            "Passkeys: registra o quita llaves de tu usuario. Alertas de seguridad listan eventos relevantes del hogar.",
          ],
          bullets: [
            {
              title: "Acceso completo",
              body: "Casi todo visible: ingresos, saldos, deudas y pantallas del hogar.",
            },
            {
              title: "Limitado",
              body: "Menos detalle sensible; buen punto de partida para adultos con menos acceso.",
            },
            {
              title: "Solo gastos",
              body: "Enfocado en hijos o perfiles de gasto: presupuestos y egresos, sin finanzas completas del hogar.",
            },
            {
              title: "Reenviar invitación",
              body: "Nuevo enlace; las políticas de esa invitación no se modifican.",
            },
          ],
          tips: [
            "El dueño siempre tiene acceso total y no se le edita la política.",
            "Después de cambiar permisos, usa “Ver como” para validar la experiencia.",
          ],
        },
      ],
    },
    {
      id: "addons",
      title: "Módulos extra",
      description: "Marketplace e instalaciones opcionales del hogar.",
      sections: [
        {
          id: "marketplace",
          title: "Marketplace",
          summary: "Instala o quita módulos extra. Por ahora todo es gratis.",
          href: "/marketplace",
          paragraphs: [
            "Los módulos del núcleo (cuentas, movimientos, presupuestos…) siempre están. Los extras se instalan por hogar.",
            "Dueño o admin pulsa Instalar. Quitar oculta el módulo; los datos se conservan si lo vuelves a instalar.",
            "Para agregar un módulo nuevo en el código se registra en el catálogo, se añade pantalla + API, y aparece aquí.",
          ],
        },
        {
          id: "properties",
          title: "Propiedades",
          summary: "Activos y pasivos: patrimonio del hogar.",
          href: "/properties",
          paragraphs: [
            "Instálalo desde el Marketplace. Ahí registras bienes (casa, auto, joyas) y deudas asociadas (hipoteca, préstamos) con un valor de compra y plusvalía o depreciación anual.",
            "Si conoces el valor de mercado (avalúo o anuncio), puedes sobreescribir el estimado. El patrimonio aparece en el inicio y se puede sumar al retiro.",
            "Una gráfica muestra cómo cambia el valor (y el patrimonio si hay hipoteca). Puedes repartir el % de dueños entre miembros del hogar.",
            "El patrimonio neto es activos menos pasivos. No mueve saldos de cuentas ni sustituye el módulo de Deudas.",
            "Puedes registrar mejoras (cocina, techo) con lo invertido; la app estima cuánto suele sumar o restar al valor (por defecto ~70% del gasto).",
            "Un pasivo se puede vincular a Deudas o crear la deuda con pago mensual. El dinero no se mueve hasta que en Deudas pulses “Pagar este mes”.",
          ],
        },
        {
          id: "prices",
          title: "Precios por tienda",
          summary: "Compara productos y vincula compras a movimientos.",
          href: "/prices",
          paragraphs: [
            "Instálalo desde el Marketplace. Registra tiendas (o pulsa tiendas comunes MX) y productos con su unidad.",
            "Anota el precio unitario que viste, o vincula un gasto de Movimientos: se calcula el precio pagado y se guarda como cotización.",
            "Si pagaste menos que la tienda más barata conocida, eso es ahorro. Si pagaste más, ves cuánto pudiste ahorrar comprando en el otro lado.",
          ],
        },
        {
          id: "investments",
          title: "Inversiones avanzadas",
          summary: "Mejor opción según riesgo, plazo e ISR.",
          href: "/investments",
          paragraphs: [
            "Elige riesgo, años y tu tasa marginal de ISR. El ranking usa tasas de referencia (CETES, Afore, etc.) cuando hay datos vivos.",
            "CETES y pagarés se gravan como interés (tu tasa). Acciones/ETFs listados ~10% sobre ganancia. Afore voluntario se trata como diferido.",
            "Es una guía de planeación, no asesoría fiscal ni recomendación personalizada de inversión.",
          ],
        },
        {
          id: "credits",
          title: "Créditos",
          summary: "Prestaste o te prestaron: cualquier persona o negocio.",
          href: "/credits",
          paragraphs: [
            "No es solo entre la familia. Puedes registrar un crédito a un amigo, empleado, cliente, tienda o empresa.",
            "“Yo presté” es dinero que te deben. “Me prestaron” es una deuda informal (los créditos bancarios siguen en Deudas).",
            "Si eliges una cuenta al crear o al cobrar/pagar, se crea el movimiento. Sin cuenta, solo queda el saldo — igual que las deudas formales.",
          ],
        },
      ],
    },
    {
      id: "settings-offline",
      title: "Ajustes y uso offline",
      description: "Preferencias del hogar, categorías, temas y modo sin conexión.",
      sections: [
        {
          id: "settings",
          title: "Ajustes",
          summary: "Idioma, moneda, tema, categorías, accesibilidad y borrado del hogar.",
          href: "/settings",
          paragraphs: [
            "Preferencias personales: idioma, tamaño de texto, reducir movimiento, alto contraste, subrayar enlaces, y tema visual (varios colores; el predeterminado es midnight).",
            "Admin/dueño: nombre del hogar, moneda del hogar, y gestión de categorías (nombre, tipo ingreso/gasto, icono, color).",
            "Las categorías organizan movimientos y presupuestos. Ocultar una categoría en Seguridad la esconde en listados y presupuestos para ese miembro.",
            "Zona peligrosa: borrar datos del hogar exige escribir una palabra de confirmación. Es irreversible.",
          ],
        },
        {
          id: "offline",
          title: "Uso sin conexión",
          summary: "PWA, caché de pantallas y cola de sincronización.",
          paragraphs: [
            "La app puede instalarse como PWA y cachear pantallas. Abre cada sección una vez con internet para usarla offline.",
            "Los cambios hechos offline se guardan en el dispositivo y se envían al volver la conexión. Verás contadores de pendientes y opción de sincronizar.",
            "Algunas acciones (importaciones grandes, ciertos respaldos) requieren conexión.",
          ],
        },
        {
          id: "catchup",
          title: "Ponerme al día",
          summary: "Repaso de lo ocurrido desde tu última visita.",
          href: "/?catchup=1",
          paragraphs: [
            "Acceso rápido desde el menú inferior. Te ayuda a revisar novedades del hogar sin buscar pantalla por pantalla.",
            "Puedes capturar el saldo real de cuentas y tarjetas. La diferencia contra la app muestra gastos (o ingresos) que aún no registraste.",
            "Si falta dinero en una cuenta o sobra deuda en una tarjeta, vuelve a gastos e ingresos y agrégalos — también puedes marcar que se pagó con tarjeta.",
          ],
        },
      ],
    },
    {
      id: "faq",
      title: "Preguntas frecuentes",
      description: "Dudas comunes y buenas prácticas.",
      sections: [
        {
          id: "faq-cc-balance",
          title: "¿Por qué un gasto con tarjeta no baja mi cuenta de banco?",
          summary: "Porque el impacto en efectivo es en la fecha de pago del ciclo, no el día de la compra.",
          paragraphs: [
            "Las compras a crédito se acumulan en la tarjeta. El banco (cuenta) se reduce cuando registras el pago a la tarjeta o cuando la proyección de ¿Cuánto gastar? aplica la fecha de pago del ciclo / MSI.",
            "Así el “seguro para gastar” no castiga dos veces el mismo dinero.",
          ],
        },
        {
          id: "faq-personal-fund",
          title: "¿Cómo le doy mesada o dinero personal a un miembro?",
          summary: "Transfiere a su cuenta Personal; no edites un número de asignación.",
          paragraphs: [
            "Ve a Cuentas → Transferir → cuenta del hogar hacia Personal · Nombre. En Presupuestos personales verá el monto en la quincena y podrá repartirlo en sus presupuestos y gastos.",
          ],
        },
        {
          id: "faq-invite",
          title: "La invitación expiró o se perdió el enlace",
          summary: "Reenvía desde Familia o Seguridad; los permisos se conservan.",
          paragraphs: [
            "Usa Reenviar en la invitación pendiente. Se genera un enlace nuevo y se extiende la fecha de expiración. Rol y política de visibilidad no cambian. El enlace viejo deja de funcionar.",
          ],
        },
        {
          id: "faq-hidden",
          title: "No veo una pantalla o un saldo",
          summary: "Casi siempre es la política de seguridad o el rol.",
          paragraphs: [
            "Revisa con un admin: módulos desactivados, categorías ocultas, “solo propios movimientos”, o saldos desactivados. Los admins pueden usar “Ver como” para reproducir lo que ves.",
          ],
        },
        {
          id: "faq-quincena",
          title: "¿Qué es una quincena aquí?",
          summary: "Periodos 1–15 y 16–fin de mes para presupuestos y reservas.",
          paragraphs: [
            "El hogar trabaja en dos mitades de mes. Presupuestos, metas y bolsas personales se alinean a esas quincenas para coincidir con pagos y hábitos comunes en México y la región.",
          ],
        },
      ],
    },
  ],
};

const en: HelpContent = {
  intro:
    "This guide explains every screen and option in MyFinances Family. Use it as the household manual—from logging a purchase to controlling who sees what. Some sections only appear if an admin granted you that module.",
  groups: [
    {
      id: "start",
      title: "Getting started",
      description: "How the household is organized and what each role does.",
      sections: [
        {
          id: "overview",
          title: "What is MyFinances Family?",
          summary: "A shared household with accounts, budgets, and per-person permissions.",
          paragraphs: [
            "MyFinances Family is a household finance app. A “household” brings together people (partners, kids, relatives) who share or view part of the money picture.",
            "Data lives with the household. Each person signs in with their own account and a passkey (Face ID, fingerprint, or security key). Passwords are not used.",
            "What each person sees depends on their role and the security policy an admin sets.",
          ],
          bullets: [
            {
              title: "Owner",
              body: "Creates the household. Always has full access. Can remove anyone and manage security.",
            },
            {
              title: "Admin",
              body: "Almost the same power as the owner: invites, changes roles (except owner), sets visibility policies, and sees everything.",
            },
            {
              title: "Member",
              body: "Uses the app according to the modules and limits they were given. Can log activity if allowed.",
            },
            {
              title: "Viewer",
              body: "Usually limited visibility and should not change finances (depending on policy).",
            },
          ],
          tips: [
            "If a menu item is missing, your security policy hides that module. Ask an admin to enable it or explain why.",
            "Owners and admins always see everything, even if a stored policy says otherwise.",
          ],
        },
        {
          id: "navigation",
          title: "Menu, language, and session",
          summary: "Sidebar, ES/EN, Catch up, and sign out.",
          paragraphs: [
            "The sidebar lists screens you can access. On mobile, open it with the menu button.",
            "At the bottom you can switch language (ES / EN). Household currency is set in Settings (admin/owner).",
            "“Catch up” opens Home with a review of what happened since your last visit.",
            "Signing out clears local offline data on the device and ends the server session when online.",
          ],
          tips: [
            "The app works partially offline: open each screen once online so it can be cached.",
            "When offline, a banner appears and changes sync when you reconnect.",
          ],
        },
        {
          id: "passkeys",
          title: "Signing in with passkeys",
          summary: "Face ID, fingerprint, or hardware key—no password.",
          paragraphs: [
            "When you create a household or join via invite, you register a passkey on the device. That is how you sign in.",
            "You can register more keys under Security (passkeys section) for other devices.",
            "If you lose access to every key, there is no password reset; recovery depends on re-invite or your deployment’s process.",
          ],
          href: "/security",
        },
      ],
    },
    {
      id: "daily",
      title: "Day to day",
      description: "Home, accounts, activity, and household budgets.",
      sections: [
        {
          id: "dashboard",
          title: "Home (overview)",
          summary: "Income, expenses, balance, alerts, and recent activity.",
          href: "/",
          paragraphs: [
            "Landing screen. Summarizes the period with income, expenses, and balance totals—if your policy allows those figures.",
            "Often includes: account balance strip, top spending by category, credit cards, budget alerts (near/over), and latest transactions.",
            "From Home you can tap “New transaction” to open the capture form without going through the menu.",
            "If an admin hid income or balances for your profile, those blocks are intentionally missing or empty.",
          ],
          tips: [
            "Use Home for a quick pulse; detail lives in Activity, Budgets, and Cards.",
          ],
        },
        {
          id: "accounts",
          title: "Accounts",
          summary: "Shared accounts, balances, transfers, and private Personal accounts.",
          href: "/accounts",
          paragraphs: [
            "Manage household accounts: cash, checking, debit, savings, or other. Each has a name, type, icon, and balance.",
            "When creating an account you can set an opening balance. It updates with income, expenses, and transfers.",
            "Transfer moves money between two household accounts (not a consumption expense). This is how you fund a member’s personal pool.",
            "Each member has (or gets) a private Personal account. Only that member and admins see it. Transfers into it fund Personal budgets for the half-month.",
          ],
          bullets: [
            {
              title: "New account",
              body: "Name, type, and opening balance. Shared accounts have no owner; personal ones are tied to a user.",
            },
            {
              title: "Transfer",
              body: "Pick from, to, and amount. One balance falls and the other rises on the same day.",
            },
            {
              title: "Delete",
              body: "Not for system personal accounts. Check you won’t leave orphaned activity.",
            },
          ],
          tips: [
            "To give personal money: Accounts → Transfer → to “Personal · Name”. That feeds their Personal budgets screen.",
            "Don’t delete personal accounts—they are each person’s private cash box.",
          ],
        },
        {
          id: "transactions",
          title: "Activity (transactions)",
          summary: "Income and expenses with one or more payment sources (account and/or card).",
          href: "/transactions",
          paragraphs: [
            "Household financial activity. Filter by period; see who spent, category, and how it was paid.",
            "When creating an expense you can split across accounts and credit cards. Payment line amounts must sum to the total.",
            "Credit card spend does not reduce a bank balance the same day—it sits on the card cycle. Optionally enable installments (MSI) to spread charges.",
            "“Spent by” links the transaction to a member (allowances, reports, and “only my activity” policies).",
            "Filter the list by who spent, category, account or card, and an amount range (in addition to the month). Filters start collapsed; open them when you need them.",
          ],
          bullets: [
            {
              title: "Income",
              body: "Increases the chosen account. Use for salary, refunds, etc.",
            },
            {
              title: "Expense",
              body: "From an account: lowers balance. From a card: accrues on the card cycle. Both: split the amount.",
            },
            {
              title: "Transfer",
              body: "Prefer Accounts → Transfer so it isn’t mixed with spending.",
            },
            {
              title: "Installments (MSI)",
              body: "Card only. Creates a monthly plan shown under Recurring, card detail, and Safe to spend.",
            },
          ],
          tips: [
            "Half cash / half card? Use “Add another payment” and split the amounts.",
            "Editing or deleting a transaction can also adjust balances and linked installment plans.",
          ],
        },
        {
          id: "budgets",
          title: "Budgets",
          summary: "Category limits by half-month (1–15 and 16–end).",
          href: "/budgets",
          paragraphs: [
            "Plan spending by category. The household uses two half-months: 1–15 and 16–end of month.",
            "Each budget shows spent vs limit. Overages surface here and on Home.",
            "Copy the previous half-month, save a default template, and apply to this period, both halves of the month, or the next year.",
            "During the half-month you can send leftover from a category to a goal (no account cash moves; remaining in that envelope drops). When the half-month ends (day 15 or the last day of the month), close it. Leftover can go to next-period emergency (without raising the planned budget), another category’s emergency, a savings goal, or be marked as spent.",
            "Past periods close with no future effect by default: they do not change the current budget or account balances. That keeps an old close from pushing leftover into today’s envelopes.",
            "“Reserve budgets” on Safe to spend holds unspent budget and emergency funding as if you will spend it all, plus future half-months. A closed period no longer implicitly carries leftover forward.",
          ],
          bullets: [
            {
              title: "This half-month only",
              body: "Affects only the period you’re viewing.",
            },
            {
              title: "Default template",
              body: "Auto-applies when a period is empty so you don’t rebuild every month.",
            },
            {
              title: "Next year",
              body: "Pushes the default across all 24 half-months of the following year.",
            },
            {
              title: "Close destinations",
              body: "Choose per category. Emergency is a cushion, not a bigger limit. Mark spent to close without moving anything forward. Sending leftover to a goal (at close or with “To goal” during the period) increases progress without moving account cash.",
            },
          ],
        },
      ],
    },
    {
      id: "cards-recurring",
      title: "Cards & recurring",
      description: "Statement cycles, payments, installments, and fixed income.",
      sections: [
        {
          id: "credit-cards",
          title: "Credit cards",
          summary: "Cutoff, grace days, amounts due, and charge/MSI detail.",
          href: "/credit-cards",
          paragraphs: [
            "Each card has a cutoff day and grace days. The app derives the open cycle, next payment, and following cycle.",
            "The list shows month spend, amounts due, and pending payments. Card detail lists charges and installment plans you can edit or delete.",
            "Deleting an installment charge asks whether to remove only that month or the whole plan—so you don’t wipe a financing plan by mistake.",
            "To pay the card, press Pay and pick the source account. That movement is never created automatically: it lowers the account balance and the remaining due. Safe to spend only projects what is still unpaid.",
          ],
          bullets: [
            {
              title: "Cutoff day",
              body: "Closes the purchase cycle (e.g. day 15).",
            },
            {
              title: "Grace days",
              body: "Days after cutoff before payment is due in your setup (e.g. 20 days → due ≈ cutoff + grace).",
            },
            {
              title: "Next payment / following cycle",
              body: "Projected dates and amounts so you know when cash leaves your accounts.",
            },
          ],
          tips: [
            "Set cutoff and grace carefully—Safe to spend and payment timing depend on them.",
            "Orphan charges from deleted expenses can be cleaned on the card detail screen.",
          ],
        },
        {
          id: "recurring",
          title: "Recurring",
          summary: "Fixed monthly income and active installment plans.",
          href: "/recurring",
          paragraphs: [
            "Recurring income (salary, pension, etc.) is projected in Safe to spend on the day of month you set.",
            "Recurring payments (Spotify, internet, rent) post automatically on that day from the chosen account or card. When creating or editing an expense, check “Repeat every month”.",
            "Installments lists active plans created when you log card MSI spend or import a statement.",
            "A recurring rule is a template; the real charge or deposit shows under Activity when it posts.",
          ],
        },
      ],
    },
    {
      id: "planning",
      title: "Planning",
      description: "Debts, goals, retirement, cash-flow lab, and personal pools.",
      sections: [
        {
          id: "debts",
          title: "Debts",
          summary: "Loans with principal, interest, and payment history.",
          href: "/debts",
          paragraphs: [
            "Track debts with principal, annual rate, suggested monthly payment, and payment day.",
            "Each debt shows how the next payment splits (interest vs principal) and how much interest you would still pay at that monthly amount.",
            "Try a different monthly payment to see instantly whether you save interest or take longer. When you record a payment, that month’s interest is calculated on the remaining balance.",
            "Debt balances can be hidden via security policy.",
          ],
        },
        {
          id: "goals",
          title: "Savings goals",
          summary: "Targets funded from an account or leftover budget.",
          href: "/goals",
          paragraphs: [
            "Define a goal (vacation, down payment, emergency) with a target amount.",
            "Fund from an account (balance drops) or from leftover in a budget category this period (no cash movement; that envelope’s remaining goes down).",
            "Period close can also send leftover to goals. Undoing an account reserve returns cash; undoing a budget contribution only lowers progress (if the period is still open).",
          ],
          tips: [
            "Goal reserves can feed the retirement planner if you enable that option.",
          ],
        },
        {
          id: "retirement",
          title: "Retirement plan",
          summary: "Educational projection: nest egg, contributions, inflation.",
          href: "/retirement",
          paragraphs: [
            "Long-range simulator: ages, desired retirement spend, returns, inflation, safe withdrawal rate, pension, and other income.",
            "Base current savings on household balances and/or goals, or enter manually. Tune monthly contributions and contribution growth.",
            "Includes Mexico reference rates (CETES, M-Bonds, Udibonos, TIIE, AFORE, inflation) grouped by country. They refresh automatically on the 1st of each month.",
            "Shows on-track vs gap, suggested monthly savings, chart, and year-by-year table.",
            "Educational estimate only—not formal financial advice.",
          ],
        },
        {
          id: "safe-to-spend",
          title: "Safe to spend",
          summary: "Cash-flow lab with projection, goals, and what-if scenarios.",
          href: "/safe-to-spend",
          paragraphs: [
            "Answers “how much can I spend today without breaking cash flow?” using account balances (all or one), future income, card payments, installments, debts, and optionally unspent budgets.",
            "Modes: Overview, Project to a date, and When will I have X?",
            "What-if scenarios: simulated income/expense that never hit real books.",
            "“Include future income” uses recurring projections. “Reserve budgets” holds unspent budget (including future halves with defaults).",
            "Card purchases don’t hit bank cash on purchase day; impact appears on cycle / installment payment dates.",
          ],
          tips: [
            "If projected minimum balance goes negative, reduce safe-to-spend or adjust scenarios.",
            "Change the horizon (days, up to 2 years) to look further ahead.",
          ],
        },
        {
          id: "personal",
          title: "Personal budgets",
          summary: "Private half-month pool: transfers + side income − personal spend.",
          href: "/personal",
          paragraphs: [
            "Each member has a private pool for the half-month. Funding is real transfers into their Personal account—not a hand-edited allocation number.",
            "Available ≈ transfers in the period + side income − personal expenses (and the personal account balance is shown).",
            "Create personal budgets (coffee, hobbies…) and log expenses against them.",
            "Admins can view another member’s pool to help manage it.",
          ],
          tips: [
            "Typical flow: admin transfers household → Personal · Ana → Ana spends from her personal budgets.",
          ],
        },
      ],
    },
    {
      id: "tools",
      title: "Tools",
      description: "Receipts, installment import, and encrypted backups.",
      sections: [
        {
          id: "tickets",
          title: "Receipts / tickets",
          summary: "Store or log receipts tied to household finances.",
          href: "/tickets",
          paragraphs: [
            "Space for tickets and receipts—handy for proof of spend or items to review.",
            "May need connectivity for larger files. If the menu item is missing, the module is off in your policy.",
          ],
        },
        {
          id: "import-statement",
          title: "Statement import",
          summary: "Detect installments in statement text/PDF and attach them to a card.",
          href: "/import-statement",
          paragraphs: [
            "Paste or upload statement text (e.g. bank MSI lines). The app detects installment plans.",
            "Review detections, pick the target card, and import selected rows into active MSI plans.",
          ],
        },
        {
          id: "import-export",
          title: "Import / Export",
          summary: "Encrypted household backup (.enc) or restore (admin).",
          href: "/import-export",
          paragraphs: [
            "Export builds a password-encrypted file. Without that password the backup cannot be restored.",
            "Import (admin/owner) can merge or replace all data. Replace is destructive—use only when sure.",
            "Security policy can hide export for some members.",
          ],
          tips: [
            "Store the backup password somewhere safe, separate from the file.",
          ],
        },
      ],
    },
    {
      id: "family-security",
      title: "Family & security",
      description: "Invites, roles, visibility policies, and view-as.",
      sections: [
        {
          id: "family",
          title: "Family",
          summary: "Members, invites, resend, and recent activity.",
          href: "/family",
          paragraphs: [
            "Member list with roles. Admins can change roles (not the owner’s) and remove members (only the owner removes admins).",
            "Invite creates a link for an email/role. Share via WhatsApp, SMS, or copy. They create an account with that email and join without creating another household.",
            "Pending invites: Resend issues a new link and extends expiry; it does not change role or security policy. Revoke invalidates the link.",
            "Recent activity logs important household actions.",
          ],
          tips: [
            "Set invite permissions under Security before they join, or resend later without touching policies.",
          ],
        },
        {
          id: "security",
          title: "Security (who sees what)",
          summary: "Access levels, hidden categories, templates, view-as, and passkeys.",
          href: "/security",
          paragraphs: [
            "Owner and admin only. Pick a member or pending invite and define their policy.",
            "Step 1: who. Step 2: level—Full, Limited, or Spend only. Step 3: hide categories (transactions and budgets for those categories).",
            "Copy another member’s policy into the editor (not saved until Save). Templates can store the current policy or be created from a member, then applied in bulk.",
            "“View as this member / invite” browses the app with their real permissions. Exit view-as to administer again.",
            "Advanced: per-screen modules, income/expense/transfers, balances, only own activity, hide specific accounts or cards, and more.",
            "Passkeys: register or remove keys for your user. Security alerts list relevant household events.",
          ],
          bullets: [
            {
              title: "Full access",
              body: "Almost everything: income, balances, debts, household screens.",
            },
            {
              title: "Limited",
              body: "Less sensitive detail; good default for adults with reduced access.",
            },
            {
              title: "Spend only",
              body: "Kid-oriented: expenses and budgets without full household finances.",
            },
            {
              title: "Resend invite",
              body: "New link; that invite’s policies stay unchanged.",
            },
          ],
          tips: [
            "The owner always has full access and cannot have their policy edited.",
            "After changing permissions, use View as to verify the experience.",
          ],
        },
      ],
    },
    {
      id: "addons",
      title: "Add-on modules",
      description: "Marketplace and optional household installs.",
      sections: [
        {
          id: "marketplace",
          title: "Marketplace",
          summary: "Install or remove extra modules. Everything is free for now.",
          href: "/marketplace",
          paragraphs: [
            "Core modules (accounts, activity, budgets…) are always there. Add-ons install per household.",
            "Owner or admin taps Install. Remove hides the module; data stays if you install it again.",
            "A new module is registered in the catalog, gets a page + API, and shows up here.",
          ],
        },
        {
          id: "properties",
          title: "Properties",
          summary: "Assets and liabilities: household net worth.",
          href: "/properties",
          paragraphs: [
            "Install it from the Marketplace. Track valuables (home, car, jewelry) and related liabilities (mortgage, loans) with a purchase value plus yearly appreciation or depreciation.",
            "If you know the market value (appraisal or listing), you can override the estimate. Net worth shows on Home and can be added to retirement savings.",
            "A chart shows how value (and equity, if there is a mortgage) changes. You can split ownership % among household members.",
            "Net worth is assets minus liabilities. It does not move account balances or replace the Debts module.",
            "You can log improvements (kitchen, roof) with what you invested; the app estimates how much that usually adds or subtracts (default ~70% of cost).",
            "A liability can link to Debts or create the debt with a monthly payment. No cash moves until you tap “Pay this month” on Debts.",
          ],
        },
        {
          id: "prices",
          title: "Store prices",
          summary: "Compare products and link purchases to movements.",
          href: "/prices",
          paragraphs: [
            "Install it from the Marketplace. Add stores (or tap common MX stores) and items with a unit.",
            "Log a unit price you saw, or link an expense from Activity: we compute the paid unit price and save it as a quote.",
            "If you paid less than the cheapest known store, that is savings. If you paid more, you see how much you could have saved elsewhere.",
          ],
        },
        {
          id: "investments",
          title: "Advanced investments",
          summary: "Best option by risk, horizon, and ISR.",
          href: "/investments",
          paragraphs: [
            "Pick risk, years, and your marginal ISR rate. The ranking uses reference rates (CETES, Afore, etc.) when live data exists.",
            "CETES and bank notes are taxed as interest (your rate). Listed stocks/ETFs ~10% on the gain. Voluntary Afore is treated as deferred.",
            "This is planning guidance, not tax advice or a personalized investment recommendation.",
          ],
        },
        {
          id: "credits",
          title: "Credits",
          summary: "You lent or borrowed: any person or business.",
          href: "/credits",
          paragraphs: [
            "Not only family. Log a credit to a friend, employee, customer, store, or company.",
            "“I lent” is money owed to you. “I borrowed” is an informal debt (bank loans stay in Debts).",
            "If you pick an account when creating or collecting/repaying, a movement is created. No account = balance only — same as formal debts.",
          ],
        },
      ],
    },
    {
      id: "settings-offline",
      title: "Settings & offline",
      description: "Household preferences, categories, themes, and offline mode.",
      sections: [
        {
          id: "settings",
          title: "Settings",
          summary: "Language, currency, theme, categories, accessibility, and wipe.",
          href: "/settings",
          paragraphs: [
            "Personal preferences: language, font size, reduced motion, high contrast, underline links, and visual theme (several colors; default is midnight).",
            "Admin/owner: household name, household currency, and categories (name, income/expense type, icon, color).",
            "Categories organize activity and budgets. Hiding a category in Security hides it in lists and budgets for that member.",
            "Danger zone: wiping household data requires typing a confirmation word. Irreversible.",
          ],
        },
        {
          id: "offline",
          title: "Offline use",
          summary: "PWA, screen cache, and sync queue.",
          paragraphs: [
            "Install as a PWA and cache screens. Open each section once online to use it offline.",
            "Offline changes stay on the device and upload when you’re back online. You’ll see pending counts and a sync action.",
            "Some actions (large imports, certain backups) need a connection.",
          ],
        },
        {
          id: "catchup",
          title: "Catch up",
          summary: "Review what happened since your last visit.",
          href: "/?catchup=1",
          paragraphs: [
            "Quick link at the bottom of the menu. Helps you scan household updates without opening every screen.",
            "Enter the real balance of accounts and cards. The gap vs the app shows expenses (or income) you still need to log.",
            "If an account is short or a card shows extra debt, go back to expenses and add them — you can also mark a charge as paid with a card.",
          ],
        },
      ],
    },
    {
      id: "faq",
      title: "FAQ",
      description: "Common questions and best practices.",
      sections: [
        {
          id: "faq-cc-balance",
          title: "Why doesn’t a card purchase lower my bank account?",
          summary: "Cash impact is on the cycle payment date, not the purchase day.",
          paragraphs: [
            "Credit purchases accrue on the card. The bank account drops when you log a card payment or when Safe to spend applies the cycle / installment due date.",
            "That way safe-to-spend doesn’t double-count the same money.",
          ],
        },
        {
          id: "faq-personal-fund",
          title: "How do I give a member personal allowance money?",
          summary: "Transfer to their Personal account; don’t edit an allocation field.",
          paragraphs: [
            "Accounts → Transfer → household account to Personal · Name. On Personal budgets they’ll see the amount for the half-month and can budget and spend it.",
          ],
        },
        {
          id: "faq-invite",
          title: "Invite expired or the link was lost",
          summary: "Resend from Family or Security; permissions are kept.",
          paragraphs: [
            "Use Resend on the pending invite. You get a new link and extended expiry. Role and visibility policy stay the same. The old link stops working.",
          ],
        },
        {
          id: "faq-hidden",
          title: "I don’t see a screen or a balance",
          summary: "Almost always security policy or role.",
          paragraphs: [
            "Check with an admin: disabled modules, hidden categories, “only own activity,” or balances turned off. Admins can View as to reproduce your experience.",
          ],
        },
        {
          id: "faq-quincena",
          title: "What is a half-month (quincena) here?",
          summary: "Periods 1–15 and 16–end for budgets and reserves.",
          paragraphs: [
            "The household runs on two halves of the month. Budgets, goals, and personal pools align to those periods—common for pay cycles in Mexico and the region.",
          ],
        },
      ],
    },
  ],
};

export function getHelpContent(locale: "es" | "en"): HelpContent {
  return locale === "en" ? en : es;
}
