# Cartera de Seguros

App web para gestionar la cartera de pólizas de la productora. Incluye:

- Panel y sección de avisos
- Navegación por rubro y por aseguradora
- Buscador global
- Fichas de cliente y de póliza
- Alta de pólizas, renovaciones e Histórico
- Exportación a Excel

**Stack:** React + Vite (app instalable en el celular), Supabase (Postgres, login y reglas de acceso) y Cloudflare Pages. Todo con plan gratis.

- Instalación paso a paso: [GUIA_INSTALACION.md](GUIA_INSTALACION.md)
- Esquema de base y permisos: [`supabase/schema.sql`](supabase/schema.sql)
- Importador de los Excel de origen: [`importador/importar.py`](importador/importar.py)

## Desarrollo

```bash
npm install
```

```bash
cp importador/salida/carga_inicial.json public/demo-data.json
```

```bash
npm run demo
```

`npm run demo` levanta la app con los datos en memoria, sin base y con cualquier mail. **Borrar `public/demo-data.json` antes de publicar** (`npm run build` se niega a seguir si lo encuentra). Para usar Supabase de verdad, crear un `.env` a partir de `.env.example` y correr `npm run dev`.

## Reglas principales

- **Estado del vencimiento:**
  - Sin fecha: SIN VTO.
  - Fecha ya pasada: VENCIDA.
  - Faltan N días o menos (N configurable, 15 por defecto): POR VENCER.
  - Si no: VIGENTE.
- **Avisos:** las gestiones marcadas como "cierra" (Renovado, No renueva) dejan de avisar.
- **Renovación:** la Manual y la por Cupones se destacan como "requiere acción".
- **Pase al Histórico:** las vencidas hace más de 30 días (configurable) pasan solas al Histórico. Lo hace la función `mantenimiento()`, que se llama al abrir la app y desde la tarea diaria de GitHub.
- **Claves:** no se guardan contraseñas. El importador descarta el texto que parece una clave.
