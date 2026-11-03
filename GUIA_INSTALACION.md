# Guía de instalación (una sola vez, unos 30 minutos)

Todo es gratis y no hace falta tarjeta de crédito. Se usan tres servicios:

| Servicio | Para qué |
|---|---|
| **Supabase** | La base de datos y el login. Ahí quedan guardados los datos. |
| **Cloudflare Pages** | Publica la app en una dirección tipo `cartera-xxx.pages.dev`. |
| **GitHub** | Guarda el código y corre la tarea diaria de mantenimiento. |

---

## 1. GitHub: guardar el código

1. Crear una cuenta en <https://github.com> si no tienen.
2. Crear un repositorio **privado** vacío (botón **New**), por ejemplo `cartera-seguros`.
3. Pasarle el nombre a Claude para que suba el código, o subirlo ustedes.

## 2. Supabase: base de datos y login

1. Entrar a <https://supabase.com> → **Start your project** → ingresar con la cuenta de GitHub.
2. **New project**:
   - Nombre: `cartera-seguros`
   - Contraseña de la base: generar una y **guardarla en el gestor de contraseñas**
   - Región: **South America (São Paulo)**
3. Cuando termine de crearse, ir a **SQL Editor** → **New query**, pegar **todo** el contenido de `supabase/schema.sql` y apretar **Run**. Tiene que decir *Success*.
4. **Authentication → Sign In / Providers**: desactivar **Allow new users to sign up**. Así nadie puede crearse una cuenta solo.
5. **Authentication → Users → Add user → Create new user**: cargar el mail y una contraseña de cada persona de la oficina, con **Auto Confirm User** tildado.
6. Volver a **SQL Editor** y autorizar a esas personas (cambiar los mails):

   ```sql
   insert into usuarios (email, nombre, rol) values
     ('duena@gmail.com',    'Nombre', 'admin'),
     ('empleada@gmail.com', 'Nombre', 'usuario');
   ```

   Solo los mails de esta lista pueden ver datos. `admin` puede además agregar usuarios y hacer la carga inicial.
7. **Project Settings → API** (o **Data API**): copiar la **Project URL** y la clave **anon public**. Se usan en los pasos 3 y 4.

> La clave *anon* no es secreta: está pensada para ir dentro de la app. Lo que protege los datos son las reglas de acceso del paso 3, que exigen login **y** estar en la lista de usuarios. La clave **service_role** sí es secreta: no se usa ni se comparte.

## 3. Cloudflare Pages: publicar la app

1. Crear una cuenta en <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → elegir el repositorio.
2. Configuración:
   - Framework preset: **Vite** (o ninguno)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - **Environment variables**:
     - `VITE_SUPABASE_URL` = la Project URL
     - `VITE_SUPABASE_ANON_KEY` = la clave anon
3. **Save and Deploy**. En 1 o 2 minutos queda en `https://<nombre>.pages.dev`.
4. Cada cambio que se sube al repositorio se publica solo.

## 4. Tarea diaria (mantenimiento)

En GitHub → el repositorio → **Settings → Secrets and variables → Actions → New repository secret**, crear dos:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

La tarea `.github/workflows/mantenimiento-diario.yml` corre todos los días a las 8:00. Hace dos cosas:

- Pasa al Histórico las pólizas vencidas hace más de 30 días.
- Mantiene vivo el proyecto de Supabase. **Los proyectos gratis se pausan después de 7 días sin uso**; con esta tarea no pasa aunque nadie entre en vacaciones.

Para probarla: pestaña **Actions → Mantenimiento diario → Run workflow**.

## 5. Carga inicial de la cartera

1. Entrar a la app con el usuario `admin`.
2. **Ajustes → Datos → Carga inicial** → elegir el archivo `carga_inicial.json`, que genera el importador a partir de los dos Excel.
3. Esperar a que diga **Carga completa ✓**.

Para regenerar el archivo, en una computadora con Python:

```bash
pip install openpyxl
```

```bash
python3 importador/importar.py Cartera_Seguros.xlsx Excel_polizas_SIN_CLAVES.xlsx
```

Deja `importador/salida/carga_inicial.json` y un `informe.md` con el detalle. **Esos archivos tienen datos personales: no subirlos a GitHub** (ya están excluidos en `.gitignore`).

## 6. En el celular

Abrir la dirección `.pages.dev`:

- **iPhone:** en Safari, Compartir → **Agregar a inicio**.
- **Android:** en Chrome, menú ⋮ → **Instalar app** o **Agregar a pantalla principal**.

Queda como un ícono más.

## 7. Copias de seguridad

El plan gratis de Supabase no guarda copias automáticas. Una vez por semana, en **Ajustes → Datos → Descargar Excel** se baja toda la cartera; guardar ese archivo en Drive.

## Límites del plan gratis (de sobra para la oficina)

- Base de 500 MB: la cartera completa ocupa menos de 5 MB.
- 50.000 usuarios por mes: se usan 3.
- Cloudflare Pages: visitas ilimitadas y 500 publicaciones por mes.
- GitHub Actions: 2.000 minutos por mes; la tarea usa menos de 1 minuto por día.
