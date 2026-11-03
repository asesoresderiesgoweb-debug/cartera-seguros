"""
Importador de la carga inicial.

Lee los dos Excel de origen y genera `salida/carga_inicial.json` (lo que se sube
desde la app en Configuración → Carga inicial) y `salida/informe.md` (qué se hizo
y qué quedó para completar).

Uso:
    python3 importar.py <Cartera_Seguros.xlsx> <Excel_polizas_SIN_CLAVES.xlsx> [AAAA-MM-DD]

Reglas (acordadas con la oficina):
- El Excel A es la base. Del Excel B se suman todas las pólizas vigentes que falten.
- No se importa ninguna contraseña: el texto libre que parece clave se descarta.
- Fechas imposibles (año 0206, 1900, 31/11, etc.) quedan vacías, con el valor
  original en notas y la póliza marcada "Para completar".
- Vencidas hace más de 30 días van al Histórico.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import openpyxl

HOY = date.fromisoformat(sys.argv[3]) if len(sys.argv) > 3 else date.today()
DIAS_HISTORICO = 30
LIMITE_HIST = HOY - timedelta(days=DIAS_HISTORICO)

# ---------------------------------------------------------------- utilidades

def sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def limpio(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).replace("\t", " ").replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def clave_nombre(n):
    if not n:
        return None
    s = sin_acentos(n.upper()).replace("Ð", "N")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    toks = sorted(t for t in s.split() if t)
    return " ".join(toks) or None


def doc_digitos(v):
    s = limpio(v)
    if not s:
        return None
    d = re.sub(r"\D", "", s)
    return d if 7 <= len(d) <= 11 else None


def formato_doc(d):
    if d and len(d) == 11:
        return f"{d[:2]}-{d[2:10]}-{d[10]}"
    return d


def clave_doc(d):
    if not d:
        return None
    if len(d) == 11:
        return d[2:10].lstrip("0")
    return d.lstrip("0")


def num_clave(v):
    s = limpio(v)
    if not s:
        return None
    s = re.sub(r"\.0$", "", s)
    d = re.sub(r"\D", "", s)
    return d.lstrip("0") or None


RE_MAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def mails(*vals):
    out = []
    for v in vals:
        for m in RE_MAIL.findall(str(v or "")):
            m = m.lower().strip(".")
            if m not in out:
                out.append(m)
    return out


def telefono(v):
    s = limpio(v)
    if not s:
        return None
    d = re.sub(r"\D", "", s)
    return d if len(d) >= 8 else None


def parece_clave(tok):
    """Palabra con letras y números mezclados, típico de una contraseña."""
    t = tok.strip(".,;:()")
    if len(t) < 6 or RE_MAIL.search(t):
        return False
    return bool(re.search(r"[A-Za-z]", t) and re.search(r"\d", t)) and not re.fullmatch(r"[A-Z]{1,3}\d{3}[A-Z]{0,3}", t)


def separar_nombre(raw):
    """'EMPRESA SA - 30712079106 - Clave12' -> (nombre, cuit, mails, nota_sin_claves)."""
    s = limpio(raw)
    if not s:
        return None, None, [], None
    ms = mails(s)
    s2 = RE_MAIL.sub(" ", s)
    partes = [p.strip() for p in re.split(r"\s+-\s+|\s+–\s+", s2) if p.strip()]
    nombre = partes[0] if partes else s2
    doc = None
    notas = []
    for p in partes[1:]:
        for tok in p.split():
            dd = re.sub(r"\D", "", tok)
            if len(dd) == 11 and not doc:
                doc = dd
        resto = " ".join(t for t in p.split() if not parece_clave(t) and len(re.sub(r"\D", "", t)) != 11)
        resto = re.sub(r"^(CUIT|CUIL|DNI)\s*:?\s*$", "", resto.strip(), flags=re.I)
        if resto.strip():
            notas.append(resto.strip())
    # en el nombre mismo puede quedar una clave pegada al final
    nombre = " ".join(t for t in nombre.split() if not parece_clave(t)).strip(" ,-")
    return nombre or None, doc, ms, ("; ".join(notas) or None)


def excel_serial(n):
    return date(1899, 12, 30) + timedelta(days=int(n))


def fecha(v):
    """Devuelve (date|None, texto_original_si_es_rara|None)."""
    if v is None or v == "":
        return None, None
    if isinstance(v, datetime):
        d = v.date()
    elif isinstance(v, date):
        d = v
    elif isinstance(v, (int, float)):
        if 30000 < v < 60000:
            d = excel_serial(v)
        else:
            return None, str(v)
    else:
        s = str(v).strip().rstrip("}")
        m = re.fullmatch(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})", s)
        if not m:
            return None, s
        dd, mm, yy = map(int, m.groups())
        if yy < 100 and len(m.group(3)) == 2:
            yy += 2000
        try:
            d = date(yy, mm, dd)
        except ValueError:
            return None, s
    if d.year < 2000 or d.year > HOY.year + 2:
        return None, d.strftime("%d/%m/%Y") if d.year > 0 else str(v)
    return d, None


def iso(d):
    return d.isoformat() if d else None


# ---------------------------------------------------------------- aseguradoras

CANON = {
    "Mercantil Andina": ["MERCANTIL", "MERCANTIL ANDINA", "LA MERCANTIL", "MER", "MERCANTI", "MERCANITIL",
                         "MERECANTIL", "MERCNATIL", "MERC ANDINA", "LA MERCANTIL ANDINA"],
    "San Cristóbal": ["SAN CRISTOBAL", "SAN CRISTOBA", "SAN CRIOBAL", "SAN CRIOBA", "SAN CRISTOBAN", "SANCRISTOBAL"],
    "Río Uruguay": ["RIO URUGUAY", "RUS"],
    "Swiss Medical": ["SMG", "SWISS MEDICAL"],
    "Cooperación": ["COOPERACION", "COOPERACION SEGUROS"],
    "Triunfo": ["TRIUNFO"],
    "La Holando": ["LA HOLANDO", "HOLANDO"],
    "Asociart": ["ASOCIART"],
    "Provincia ART": ["PROVINCIA", "PROVINCIA ART", "PROVINICIA", "PROVINCIA A R T"],
    "Experta": ["EXPERTA", "EXPERTA ART"],
    "Serena ART": ["SERENA", "SERENA ART"],
    "Federación Patronal": ["FED PAT", "FED PATRONAL", "FEDERACION PATRONAL", "FEDE", "FED"],
    "Prevención ART": ["PREVENCION", "PREVENCION ART", "PREVENCION A R T"],
    "Omint ART": ["OMINT", "OMINT ART"],
    "Andina ART": ["ANDINA ART"],
    "Berkley": ["BERKLEY", "BERCKLEY"],
    "La Meridional": ["MERIDIONAL", "LA MERIDIONAL"],
    "ACG": ["ACG", "ACG CAUCIONES"],
    "Sura": ["SURA"],
    "Mapfre": ["MAPFRE"],
    "Sancor": ["SANCOR"],
    "HSBC": ["HSBC"],
    "Galicia": ["GALICIA"],
    "QBE": ["QBE"],
    "La Caja": ["LA CAJA"],
    "Sin identificar": ["ART"],
}
# Las que figuran solo en el directorio de contactos
DIRECTORIO_EXTRA = {
    "ESCUDO": "Escudo", "SOS": "SOS", "ZURICH": "Zurich", "ANTARTIDA SEGUROS": "Antártida",
    "RPC": "RPC", "LA SEGUNDA": "La Segunda", "ORBIS": "Orbis", "ATM": "ATM",
    "LA PERSEVERANCIA": "La Perseverancia", "CARUSO": "Caruso", "EL NORTE": "El Norte",
    "SEGURO PROVINCIA CORDOBA": "Seguros Provincia de Córdoba",
}
# Aseguradoras cuyos contratos en la hoja ART son ART (el resto es Vida Obligatorio)
SOLO_ART = {"Asociart", "Provincia ART", "Experta", "Serena ART", "Prevención ART", "Omint ART",
            "Andina ART", "Berkley", "Federación Patronal", "QBE", "La Caja", "Sin identificar"}


def k_cia(s):
    s = sin_acentos(str(s).upper())
    s = re.sub(r"[^A-Z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


VAR2CANON = {}
for canon, vs in CANON.items():
    VAR2CANON[k_cia(canon)] = canon
    for v in vs:
        VAR2CANON[k_cia(v)] = canon
for k, canon in DIRECTORIO_EXTRA.items():
    VAR2CANON[k_cia(k)] = canon
A_NAMES = {"Mercantil": "Mercantil Andina", "Experta ART": "Experta"}

aseg = {}            # nombre -> dict
variantes_vistas = defaultdict(set)


def cia(raw):
    s = limpio(raw)
    if not s:
        return None
    s = A_NAMES.get(s, s)
    if s in CANON:
        nombre = s
    else:
        k = k_cia(s)
        if not k:          # números u otra basura en la columna de compañía
            return None
        nombre = VAR2CANON.get(k)
        if not nombre:
            return None
        variantes_vistas[nombre].add(s.strip())
    if nombre not in aseg:
        aseg[nombre] = {"id": len(aseg) + 1, "nombre": nombre, "variantes": [], "contactos": [], "web": None, "portal": None, "activa": True}
    return nombre


# ---------------------------------------------------------------- rubros

T, N, F, O, L = "texto", "numero", "fecha", "opciones", "largo"
RUBROS = [
    ("ART", False, [("actividad", "Actividad", T), ("capitas", "Cápitas", N), ("tasa", "Tasa", N)]),
    ("Vida Obligatorio", False, [("actividad", "Actividad", T), ("capitas", "Cápitas", N)]),
    ("Accidentes Personales", False, [
        ("tipo", "Tipo", O, ["Prestacional", "Plenus", "Plenus Variable", "Tradicional", "Otro"]),
        ("actividad", "Actividad / especialidad", T), ("obra", "Obra / referencia", T),
        ("nomina", "Nómina (una persona por línea)", L), ("costo_mensual", "Costo mensual", N)]),
    ("Automotor", True, [("cobertura", "Cobertura", T), ("costo_mensual", "Costo mensual", N)]),
    ("Moto", True, [("cobertura", "Cobertura", T), ("costo_mensual", "Costo mensual", N)]),
    ("Hogar", False, [("ubicacion", "Ubicación", T), ("cobertura", "Cobertura", T), ("costo_mensual", "Costo mensual", N)]),
    ("Comercio y Consorcio", False, [("ubicacion", "Ubicación", T), ("cobertura", "Cobertura", T),
                                     ("costo_mensual", "Costo mensual", N)]),
    ("Otros", False, [("tipo", "Tipo", O, ["Seguro técnico", "Caución", "Responsabilidad civil", "Bicicleta", "Otro"]),
                      ("cobertura", "Cobertura", T), ("costo_mensual", "Costo mensual", N)]),
]
rubros = []
RUBRO_ID = {}
for i, (nombre, usa_items, campos) in enumerate(RUBROS, 1):
    cs = []
    for c in campos:
        d = {"k": c[0], "label": c[1], "tipo": c[2]}
        if len(c) > 3:
            d["opciones"] = c[3]
        cs.append(d)
    rubros.append({"id": i, "nombre": nombre, "orden": i, "usa_items": usa_items, "campos": cs, "activo": True})
    RUBRO_ID[nombre] = i
SHEET_RUBRO = {"ART": "ART", "Vida": "Vida Obligatorio", "Accidentes Personales": "Accidentes Personales",
               "Automotor": "Automotor", "Moto": "Moto", "Hogar": "Hogar",
               "Comercio y Consorcio": "Comercio y Consorcio", "Otros": "Otros"}

# ---------------------------------------------------------------- clientes

clientes = []
por_doc = {}
por_nombre = {}


def cliente(nombre, doc=None, mail_list=(), tel=None, obs=None):
    nombre = limpio(nombre)
    if not nombre:
        return None
    kd = clave_doc(doc)
    kn = clave_nombre(nombre)
    c = por_doc.get(kd) if kd else None
    if c is None and kn:
        c = por_nombre.get(kn)
        if c is not None and kd and c["_kd"] and c["_kd"] != kd:
            c = None   # mismo nombre, distinto documento: son personas distintas
    if c is None:
        c = {"id": len(clientes) + 1, "nombre": nombre, "doc": formato_doc(doc), "mail": None, "telefono": None,
             "domicilio": None, "observaciones": None, "_kd": kd, "_mails": [], "_tels": []}
        clientes.append(c)
    if kd and not c["_kd"]:
        c["_kd"] = kd
        c["doc"] = formato_doc(doc)
    elif doc and c["doc"] and len(doc) == 11 and len(re.sub(r"\D", "", c["doc"])) < 11:
        c["doc"] = formato_doc(doc)   # preferir CUIT sobre DNI
    if kd:
        por_doc.setdefault(kd, c)
    if kn:
        por_nombre.setdefault(kn, c)
    for m in mail_list:
        if m not in c["_mails"]:
            c["_mails"].append(m)
    if tel and tel not in c["_tels"]:
        c["_tels"].append(tel)
    if obs:
        c["observaciones"] = (c["observaciones"] + "; " if c["observaciones"] else "") + obs
    return c


# ---------------------------------------------------------------- pólizas

polizas = []
items = []
idx_num = {}          # (cia, numclave) -> poliza
idx_pat = {}          # (cia, patente) -> poliza
idx_pat_any = defaultdict(list)
stats = defaultdict(int)
informe_listas = defaultdict(list)

RE_PAT = re.compile(r"(?<![A-Z0-9])([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}-?\d{3}|[A-Z]\d{3}[A-Z]{3}|\d{3}-?[A-Z]{3})(?![A-Z0-9])")


def patente_de(texto):
    if not texto:
        return None
    m = RE_PAT.findall(sin_acentos(str(texto).upper()))
    return m[-1].replace("-", "") if m else None


def norm_pat(v):
    s = limpio(v)
    if not s:
        return None
    s = re.sub(r"[\s\-.]", "", sin_acentos(s.upper()))
    return s if 6 <= len(s) <= 9 else None


def quitar_patente(texto, pat):
    if not (texto and pat):
        return texto
    m = re.match(r"([A-Z]+)(\d+)([A-Z]*)$", pat)
    rx = "-?".join(re.escape(g) for g in m.groups() if g) if m else re.escape(pat)
    return re.sub(rf"\s*\b{rx}\b", "", texto, flags=re.I).strip() or None


def es_moto_pat(p):
    return bool(p and (re.fullmatch(r"[A-Z]\d{3}[A-Z]{3}", p) or re.fullmatch(r"\d{3}[A-Z]{3}", p)))


def nueva_poliza(**kw):
    p = {"id": len(polizas) + 1, "cliente_id": None, "aseguradora_id": None, "rubro_id": None, "numero": None,
         "detalle": None, "desde": None, "vence": None, "fin_anual": None, "renovacion": None,
         "gestion": "Sin gestionar", "estado_cuota": None, "prox_vto_cuota": None, "datos": {}, "notas": None,
         "estado": "activa", "baja_motivo": None, "baja_fecha": None, "revisar": None, "origen": None}
    p.update(kw)
    polizas.append(p)
    return p


def add_nota(p, txt):
    if txt:
        p["notas"] = (p["notas"] + " · " if p["notas"] else "") + txt


def add_revisar(p, txt):
    p["revisar"] = (p["revisar"] + " · " if p["revisar"] else "") + txt


def add_item(p, patente=None, detalle=None, datos=None):
    it = {"id": len(items) + 1, "poliza_id": p["id"], "patente": patente, "detalle": detalle, "datos": datos or {}}
    items.append(it)
    if patente:
        idx_pat[(p["_cia"], patente)] = p
        idx_pat_any[patente].append(p)
    return it


def registrar(p, cia_nombre, num):
    p["_cia"] = cia_nombre
    p["aseguradora_id"] = aseg[cia_nombre]["id"] if cia_nombre else None
    k = num_clave(num)
    if k and cia_nombre and len(k) >= 4:
        idx_num.setdefault((cia_nombre, k), p)


def aplicar_fechas(p, desde_raw, vence_raw):
    d, rd = fecha(desde_raw)
    v, rv = fecha(vence_raw)
    p["desde"], p["vence"] = iso(d), iso(v)
    if rd:
        add_nota(p, f"Fecha desde original: «{rd}»")
        add_revisar(p, "Fecha desde inválida")
    if rv:
        add_nota(p, f"Vencimiento original: «{rv}»")
        add_revisar(p, "Fecha de vencimiento inválida")
    if d and v and v < d:
        add_revisar(p, "El vencimiento es anterior al inicio")
    elif d and v and (v - d).days > 400 and p["rubro_id"] not in (RUBRO_ID["ART"], RUBRO_ID["Vida Obligatorio"]):
        add_revisar(p, "Vigencia de más de un año")
    return d, v


def sin_cbu(num):
    """En algunas celdas de póliza quedó pegado un CBU (22 dígitos): no se importa."""
    if num and len(re.sub(r"\D", "", str(num))) >= 20:
        return None
    return num


def num_ap(v):
    """Números de La Holando que Excel guardó como decimal (136624.6 -> 1366246)."""
    if isinstance(v, float) and not v.is_integer():
        s = repr(v)
        return s.replace(".", "")
    return limpio(v)


# ================================================================ EXCEL A

def leer_a(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    flotas = {}
    triunfo_pend = []
    for hoja, rubro in SHEET_RUBRO.items():
        ws = wb[hoja]
        rows = list(ws.iter_rows(values_only=True))
        h = next(i for i, r in enumerate(rows) if r and r[0] == "Compañía")
        for r in rows[h + 1:]:
            if not r or not r[0]:
                continue
            ciaN, aseg_raw, doc, num, riesgo, desde, vence, _, _, pvc, ecuota, gest, renov, notas = (list(r) + [None] * 14)[:14]
            c_n = cia(ciaN)
            nombre, doc2, ms, nota_nom = separar_nombre(aseg_raw)
            cl = cliente(nombre, doc_digitos(doc) or doc2, ms)
            num_s = limpio(num)
            riesgo_s = limpio(riesgo)
            notas_s = limpio(notas)
            en_tramite = bool(num_s and "TRAMITE" in sin_acentos(num_s.upper()))
            usa_items = rubro in ("Automotor", "Moto")
            pat = patente_de(riesgo_s) if usa_items else None
            # flotas: misma compañía + póliza + asegurado
            fk = (c_n, num_s, cl["id"] if cl else None)
            if usa_items and num_s and not en_tramite and fk in flotas:
                p = flotas[fk]
                det = quitar_patente(riesgo_s, pat)
                add_item(p, pat, det)
                continue
            p = nueva_poliza(cliente_id=cl["id"] if cl else None, rubro_id=RUBRO_ID[rubro],
                             numero=None if en_tramite else num_s, origen="Excel A")
            registrar(p, c_n, None if en_tramite else num_s)
            if en_tramite:
                p["datos"]["en_tramite"] = True
            aplicar_fechas(p, desde, vence)
            if pvc:
                p["prox_vto_cuota"] = iso(fecha(pvc)[0])
            p["estado_cuota"] = limpio(ecuota)
            p["gestion"] = limpio(gest) or "Sin gestionar"
            rv = limpio(renov)
            p["renovacion"] = {"Cupones": "Cupones", "Por cupones": "Cupones"}.get(rv, rv)
            add_nota(p, nota_nom)
            # notas -> campos
            if notas_s:
                m = re.fullmatch(r"(\d+) cápitas", notas_s)
                mf = re.fullmatch(r"Fin anual: (\d{2}/\d{2}/\d{4})", notas_s)
                if m:
                    p["datos"]["capitas"] = int(m.group(1))
                elif mf:
                    p["fin_anual"] = iso(fecha(mf.group(1))[0])
                elif "cross selling" not in (riesgo_s or "") and "falta fecha" not in notas_s:
                    add_nota(p, notas_s)
            if rubro in ("ART", "Vida Obligatorio") and riesgo_s:
                if riesgo_s not in ("Vida Colectivo Obligatorio", "Contrato ART (vigencia continua)"):
                    p["datos"]["actividad"] = riesgo_s
                else:
                    p["detalle"] = riesgo_s
            elif usa_items:
                if riesgo_s and "cross selling" in riesgo_s:
                    triunfo_pend.append(p)
                    p["_triunfo"] = True
                elif riesgo_s and riesgo_s.startswith("FLOTA"):
                    p["detalle"] = re.sub(r"\s+\S+$", "", riesgo_s) if pat else riesgo_s
                    add_item(p, pat, None)
                    flotas[fk] = p
                else:
                    det = quitar_patente(riesgo_s, pat)
                    add_item(p, pat, det)
                    flotas[fk] = p
            elif rubro == "Accidentes Personales" and riesgo_s:
                p["detalle"] = riesgo_s.replace("Accidentes personales — ", "AP ")
            elif rubro == "Otros" and riesgo_s:
                p["detalle"] = riesgo_s
                u = sin_acentos(riesgo_s.upper())
                p["datos"]["tipo"] = ("Bicicleta" if "BICI" in u else "Caución" if "CAUCION" in u else
                                      "Seguro técnico" if "TECNICO" in u else
                                      "Responsabilidad civil" if re.search(r"\bRC\b|RESPONSABILIDAD", u) else "Otro")
            else:
                p["detalle"] = riesgo_s
                if rubro in ("Hogar",) and riesgo_s and " ubicado en " in riesgo_s:
                    p["detalle"], p["datos"]["ubicacion"] = riesgo_s.split(" ubicado en ", 1)
            if c_n == "Asociart" and not p["vence"]:
                p["datos"]["vigencia_continua"] = True
            stats["A activas"] += 1
    # Histórico de A
    ws = wb["Histórico"]
    rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if r and r[0] == "Compañía")
    for r in rows[h + 1:]:
        if not r or not any(r[:8]):
            continue
        ciaN, rubro, aseg_raw, doc, num, riesgo, fb, motivo = r[:8]
        c_n = cia(ciaN)
        nombre, doc2, ms, _ = separar_nombre(aseg_raw)
        cl = cliente(nombre, doc_digitos(doc) or doc2, ms)
        rub = SHEET_RUBRO.get(limpio(rubro), limpio(rubro))
        p = nueva_poliza(cliente_id=cl["id"] if cl else None, rubro_id=RUBRO_ID.get(rub, RUBRO_ID["Otros"]),
                         numero=limpio(num), detalle=limpio(riesgo), estado="baja",
                         baja_fecha=iso(fecha(fb)[0]), baja_motivo=limpio(motivo), gestion=None, origen="Excel A (Histórico)")
        registrar(p, c_n, num)
        stats["A histórico"] += 1
    return triunfo_pend


# ================================================================ EXCEL B

def ws_rows(wb, name):
    return [list(r) for r in wb[name].iter_rows(values_only=True)]


def clasificar_patrimonial(riesgo, cobertura, dominio, anio):
    u = sin_acentos(f"{riesgo or ''} {cobertura or ''}".upper())
    if dominio:
        if es_moto_pat(dominio):
            return "Moto"
        return "Automotor"
    if re.search(r"HOGAR|COMBINADO FAMILIAR|VIVIENDA", u):
        return "Hogar"
    if re.search(r"COMERCIO|INTEGRAL|INCENDIO|CONSORCIO|INDUSTRIA", u):
        return "Comercio y Consorcio"
    if re.search(r"ACCIDENTES PERSONALES|^AP\b|\bAP$", u.strip()):
        return "Accidentes Personales"
    if re.search(r"MOTOMEL|ZANELLA|BAJAJ|GILERA|CORVEN|KELLER|YAMAHA|TORNADO|WAVE|TWISTER|BIZ\b", u):
        return "Moto"
    if anio or re.search(r"FORD|FIAT|VOLKSWAGEN|\bVW\b|PEUGEOT|RENAULT|CHEVROLET|TOYOTA|CITROEN|NISSAN|HYUNDAI|"
                         r"JEEP|HONDA|KIA|CHERY|AMAROK|HILUX|RANGER|S10|PICK ?UP|TRAILER|ACOPLADO", u):
        return "Automotor"
    return "Otros"


def tipo_otros(riesgo, cobertura):
    u = sin_acentos(f"{riesgo or ''} {cobertura or ''}".upper())
    if "BICI" in u:
        return "Bicicleta"
    if "CAUCION" in u:
        return "Caución"
    if re.search(r"TECNICO|ELEVADOR|EQUIPO", u):
        return "Seguro técnico"
    if re.search(r"\bRC\b|RESPONSABILIDAD", u):
        return "Responsabilidad civil"
    return "Otro"


def buscar_existente(c_n, num, pats=()):
    k = num_clave(num)
    if c_n and k and len(k) >= 4 and (c_n, k) in idx_num:
        return idx_num[(c_n, k)]
    for pt in pats:
        if pt and (c_n, pt) in idx_pat:
            return idx_pat[(c_n, pt)]
    return None


def enriquecer(p, datos, cl_info):
    for k, v in datos.items():
        if v not in (None, "") and k not in p["datos"]:
            p["datos"][k] = v
    if cl_info and p["cliente_id"]:
        c = clientes[p["cliente_id"] - 1]
        for m in cl_info.get("mails", []):
            if m not in c["_mails"]:
                c["_mails"].append(m)
        t = cl_info.get("tel")
        if t and t not in c["_tels"]:
            c["_tels"].append(t)


def decidir_estado(desde, vence):
    """activa | baja (vencida hace mucho) | sin_fechas | sin_vto_reciente | sin_vto_viejo"""
    if vence:
        return "activa" if vence >= LIMITE_HIST else "baja"
    if not desde:
        return "sin_fechas"
    return "sin_vto_reciente" if desde >= HOY - timedelta(days=400) else "sin_vto_viejo"


candidatos = []   # filas de B: se deciden al final, conservando la más nueva por póliza


def candidato(**kw):
    candidatos.append(kw)


def leer_patrimoniales(wb):
    rows = ws_rows(wb, "PATRIMONIALES")[1:]
    prev = None
    for i, r in enumerate(rows):
        r = r + [None] * 20
        asegurado, matric, referido, cobro, num, riesgo, anio, cobertura, dominio, ciaN, desde, hasta, costo, mail, tel = \
            r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14], r[15], r[16]
        if not any(x not in (None, "") for x in (asegurado, num, riesgo, dominio, ciaN, desde, hasta)):
            continue
        dom = norm_pat(dominio)
        if asegurado is None and prev:
            # fila sin nombre: otro vehículo / dato del asegurado anterior
            if num is None and desde is None and hasta is None and prev.get("_vehiculos") is not None and dom:
                prev["_vehiculos"].append((dom, limpio(riesgo), limpio(anio)))
                continue
            asegurado = prev["asegurado"]
        c_n = cia(ciaN)
        rub = clasificar_patrimonial(limpio(riesgo), limpio(cobertura), dom, limpio(anio))
        datos = {"cobertura": limpio(cobertura)}
        if isinstance(costo, (int, float)) and costo > 0:
            datos["costo_mensual"] = round(float(costo), 2)
        elif isinstance(costo, str):
            try:
                datos["costo_mensual"] = float(costo.replace(".", "").replace(",", "."))
            except ValueError:
                pass
        if limpio(matric) in ("CRISTINA", "FERNANDO"):
            datos["productor"] = limpio(matric).title()
        if limpio(referido):
            datos["referido_por"] = limpio(referido)
        cob = (limpio(cobro) or "").upper()
        renov = {"CBU": "Automática", "CUPONES": "Cupones"}.get(cob)
        nombre, doc2, ms, nota = separar_nombre(asegurado)
        rec = dict(hoja="PATRIMONIALES", fila=i + 2, asegurado=asegurado, nombre=nombre, doc=doc2,
                   mails=ms + mails(mail), tel=telefono(tel), cia=c_n, cia_raw=limpio(ciaN), rubro=rub,
                   numero=limpio(num), desde_raw=desde, vence_raw=hasta, datos=datos, nota=nota, renov=renov,
                   detalle=limpio(riesgo), _vehiculos=[(dom, limpio(riesgo), limpio(anio))] if rub in ("Automotor", "Moto") else None,
                   anular=(cob == "ANULAR"))
        candidato(**rec)
        prev = rec


def leer_ap(wb):
    rows = ws_rows(wb, "A.P.")[1:]
    prev = None
    for i, r in enumerate(rows):
        r = r + [None] * 16
        tomador, nomina, dni, obra, num, tipo, esp, ciaN, desde, hasta, mail, tel = r[2:14]
        if tomador is None and nomina and prev:
            prev["_nomina"].append(f"{limpio(nomina)}" + (f" (DNI {limpio(dni)})" if dni else ""))
            continue
        if not any(x not in (None, "") for x in (tomador, num, ciaN, desde)):
            continue
        t = sin_acentos((limpio(tipo) or "").upper())
        tipo_n = ("Plenus Variable" if "VARIABLE" in t else "Plenus" if "PLENUS" in t else
                  "Prestacional" if re.search(r"PRES|PRET", t) else "Tradicional" if "TRADICIONAL" in t else
                  "Otro" if t else None)
        nombre, doc2, ms, nota = separar_nombre(tomador)
        rec = dict(hoja="A.P.", fila=i + 2, asegurado=tomador, nombre=nombre, doc=doc2,
                   mails=ms + mails(mail), tel=telefono(tel), cia=cia(ciaN), cia_raw=limpio(ciaN),
                   rubro="Accidentes Personales", numero=num_ap(num), desde_raw=desde, vence_raw=hasta,
                   datos={"tipo": tipo_n, "actividad": limpio(esp), "obra": limpio(obra)}, nota=nota, renov=None,
                   detalle=None, _vehiculos=None, _nomina=[], anular=False)
        if nomina:
            rec["_nomina"].append(f"{limpio(nomina)}" + (f" (DNI {limpio(dni)})" if dni else ""))
        candidato(**rec)
        prev = rec


def leer_art(wb):
    rows = ws_rows(wb, "A.R.T. VID OBLI")[1:]
    cur = None   # cliente del bloque
    for i, r in enumerate(rows):
        r = r + [None] * 16
        razon, contacto, cuit, contrato, vig, hasta, mov, act, tipo, ciaN, capitas, tasa, mail = \
            r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14]
        if razon is not None:
            nombre, doc2, ms, nota = separar_nombre(razon)
            d = doc_digitos(cuit) or doc2
            cur = dict(nombre=nombre, doc=d, mails=ms + mails(mail, contacto, r[15]), nota=nota, raw=razon)
        elif cur is not None:
            cur["mails"] += [m for m in mails(mail, contacto) if m not in cur["mails"]]
        if cur is None or not any(x not in (None, "") for x in (contrato, ciaN, vig, hasta)):
            continue
        c_n = cia(ciaN)
        t = sin_acentos((limpio(tipo) or "").upper()) if isinstance(tipo, str) else ""
        num = num_ap(contrato)
        if re.search(r"VIDA|SVO|COLECTIVO", t):
            rub = "Vida Obligatorio"
        elif "ART" in t:
            rub = "ART"
        elif num and re.match(r"01-03-17|115-|CO10", num):
            rub = "Vida Obligatorio"
        elif c_n in SOLO_ART:
            rub = "ART"
        else:
            rub = "Vida Obligatorio"
        if rub == "ART" and c_n and c_n not in SOLO_ART:
            rub = "Vida Obligatorio"   # San Cristóbal, La Holando, etc. no venden ART
        datos = {"actividad": limpio(act)}
        if isinstance(capitas, (int, float)):
            datos["capitas"] = int(capitas)
        if isinstance(tasa, (int, float)) and tasa:
            datos["tasa"] = float(tasa)
        if isinstance(mov, str) and limpio(mov):
            datos["movimiento"] = limpio(mov).capitalize()
        candidato(hoja="A.R.T. VID OBLI", fila=i + 2, asegurado=cur["raw"], nombre=cur["nombre"], doc=cur["doc"],
                  mails=list(cur["mails"]), tel=None, cia=c_n, cia_raw=limpio(ciaN), rubro=rub, numero=num,
                  desde_raw=vig, vence_raw=hasta, datos=datos, nota=cur["nota"], renov=None, detalle=None,
                  _vehiculos=None, anular=False)


def leer_anuladas(wb):
    for i, r in enumerate(ws_rows(wb, "ANULADAS")):
        r = r + [None] * 16
        nombre_raw, cuit, contrato, desde, hasta, mov, act, ciaN, capitas, estado = r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[13]
        if not limpio(nombre_raw):
            continue
        # en algunas filas las columnas están corridas: si "compañía" no es compañía, probar la de al lado
        c_n = cia(ciaN) or cia(mov) or cia(act)
        nombre, doc2, ms, nota = separar_nombre(nombre_raw)
        cl = cliente(nombre, doc_digitos(cuit) or doc2, ms)
        num = limpio(contrato)
        if num and buscar_existente(c_n, num):
            continue
        p = nueva_poliza(cliente_id=cl["id"], rubro_id=RUBRO_ID["ART"], numero=num, estado="baja",
                         baja_motivo=f"Anulada — {limpio(estado)}" if limpio(estado) else "Anulada / rescindida",
                         baja_fecha=iso(fecha(hasta)[0] or fecha(desde)[0]), gestion=None,
                         datos={"actividad": limpio(act)} if isinstance(act, str) else {},
                         origen="Excel B (ANULADAS)")
        registrar(p, c_n, num)
        stats["B anuladas"] += 1


def procesar_candidatos(triunfo_pend):
    # 1) Triunfo de A sin número ni fecha: completar con el dato más nuevo de B
    tri_b = defaultdict(list)
    for cd in candidatos:
        if cd["cia"] == "Triunfo" and cd["hoja"] == "PATRIMONIALES":
            tri_b[clave_nombre(cd["nombre"])].append(cd)
    for p in triunfo_pend:
        cl = clientes[p["cliente_id"] - 1]
        opts = [cd for cd in tri_b.get(clave_nombre(cl["nombre"]), [])
                if cd["rubro"] in ("Automotor", "Moto") and not cd.get("_usado")]
        rub_p = "Moto" if p["rubro_id"] == RUBRO_ID["Moto"] else "Automotor"
        opts = sorted(opts, key=lambda cd: (cd["rubro"] == rub_p, fecha(cd["vence_raw"])[0] or date.min), reverse=True)
        if opts:
            cd = opts[0]
            cd["_usado"] = True
            p["numero"] = sin_cbu(cd["numero"])
            registrar(p, "Triunfo", p["numero"])
            d, v = aplicar_fechas(p, cd["desde_raw"], cd["vence_raw"])
            enriquecer(p, cd["datos"], cd)
            for dom, det, anio in cd["_vehiculos"] or []:
                add_item(p, dom, det, {"anio": anio} if anio else None)
            if v and v < LIMITE_HIST:
                p["vence"] = None
                add_nota(p, f"Último vencimiento en la planilla anterior: {v.strftime('%d/%m/%Y')}")
                add_revisar(p, "Falta vencimiento actual (Triunfo)")
            elif not v:
                add_revisar(p, "Falta vencimiento (Triunfo)")
            stats["Triunfo completadas con B"] += 1
        else:
            add_revisar(p, "Falta número de póliza y vencimiento (Triunfo)")
            p["detalle"] = None
            stats["Triunfo sin datos en B"] += 1
    # 2) resto de B
    grupos = {}
    for cd in candidatos:
        if cd.get("_usado"):
            continue
        cd["_desde"], cd["_rd"] = fecha(cd["desde_raw"])
        cd["_vence"], cd["_rv"] = fecha(cd["vence_raw"])
        pats = [v[0] for v in (cd["_vehiculos"] or []) if v[0]]
        ex = buscar_existente(cd["cia"], cd["numero"], pats)
        if ex is not None:
            enriquecer(ex, cd["datos"], cd)
            if cd["renov"] and not ex["renovacion"] and ex["estado"] == "activa":
                ex["renovacion"] = cd["renov"]
            if cd.get("_nomina"):
                ex["datos"].setdefault("nomina", "\n".join(cd["_nomina"]))
            stats[f"B ya estaba ({cd['hoja']})"] += 1
            continue
        k = num_clave(cd["numero"])
        gk = (cd["cia"], k) if k and len(k) >= 4 else (cd["cia"], pats[0]) if pats else ("fila", cd["hoja"], cd["fila"])
        prev = grupos.get(gk)
        if prev is None or (cd["_vence"] or cd["_desde"] or date.min) >= (prev["_vence"] or prev["_desde"] or date.min):
            if prev is not None:
                stats["B renovaciones antiguas descartadas (misma póliza)"] += 1
            grupos[gk] = cd
        else:
            stats["B renovaciones antiguas descartadas (misma póliza)"] += 1

    for cd in grupos.values():
        estado = decidir_estado(cd["_desde"], cd["_vence"])
        if cd["anular"]:
            estado = "baja"
        if cd["cia"] is None:
            # sin compañía reconocible
            pass
        cl = cliente(cd["nombre"], cd["doc"], cd["mails"], cd["tel"])
        if cl is None:
            stats["B filas sin asegurado (descartadas)"] += 1
            continue
        p = nueva_poliza(cliente_id=cl["id"], rubro_id=RUBRO_ID[cd["rubro"]], numero=cd["numero"],
                         detalle=cd["detalle"] if cd["rubro"] not in ("Automotor", "Moto") else None,
                         origen=f"Excel B ({cd['hoja']}, fila {cd['fila']})", renovacion=cd["renov"])
        registrar(p, cd["cia"], cd["numero"])
        aplicar_fechas(p, cd["desde_raw"], cd["vence_raw"])
        p["datos"].update({k: v for k, v in cd["datos"].items() if v not in (None, "")})
        if cd.get("_nomina"):
            p["datos"]["nomina"] = "\n".join(cd["_nomina"])
        if cd["rubro"] == "Otros":
            p["datos"]["tipo"] = tipo_otros(cd["detalle"], cd["datos"].get("cobertura"))
        add_nota(p, cd["nota"])
        if cd["cia"] is None:
            add_revisar(p, f"Compañía no reconocida («{cd['cia_raw'] or 'vacía'}»)")
            informe_listas["Compañía no reconocida"].append(p)
        for dom, det, anio in cd["_vehiculos"] or []:
            add_item(p, dom, det, {"anio": anio} if anio else None)
            if dom:
                otras = [o for o in idx_pat_any[dom] if o is not p and o["estado"] == "activa" and o["_cia"] != cd["cia"]]
                if otras and estado == "activa":
                    add_revisar(p, f"La patente {dom} también figura en {otras[0]['_cia']}")
                    informe_listas["Patente en dos compañías"].append(p)
        if estado == "activa":
            stats[f"B sumadas a cartera ({cd['hoja']})"] += 1
        elif estado == "sin_vto_reciente":
            add_revisar(p, "Falta fecha de vencimiento")
            stats[f"B sumadas sin vencimiento ({cd['hoja']})"] += 1
        else:
            p["estado"] = "baja"
            p["gestion"] = None
            if estado == "baja":
                p["baja_motivo"] = "Anulada" if cd["anular"] else "Vencida (planilla anterior)"
                p["baja_fecha"] = p["vence"]
            else:
                p["baja_motivo"] = "Planilla anterior sin fechas" if estado == "sin_fechas" else "Planilla anterior sin vencimiento"
                p["baja_fecha"] = p["desde"]
            stats[f"B a Histórico ({cd['hoja']})"] += 1


def leer_directorio(wb):
    actual = None
    for r in ws_rows(wb, "Direcciones mail"):
        r = r + [None] * 6
        c0, tram, dato, tel = limpio(r[1]), limpio(r[2]), limpio(r[3]), limpio(r[4])
        texto = " ".join(x for x in (c0, tram, dato, tel) if x)
        if re.search(r"clave|contrase|password|usuario", sin_acentos(texto.lower())):
            continue
        if c0:
            base = re.split(r"\s+-\s+", c0)[0]
            n = cia(base)
            if n:
                actual = aseg[n]
                if " - " in c0:
                    actual["contactos"].append({"tramite": "Dirección", "dato": c0.split(" - ", 1)[1]})
                c0 = None
            elif actual is None:
                continue
        if actual is None:
            continue
        info = " ".join(x for x in (c0, dato) if x)
        if not (info or tel):
            continue
        actual["contactos"].append({"tramite": tram or "General", "dato": info or None, "telefono": tel})
        if info and info.startswith("http") and not actual["web"]:
            actual["web"] = info


def leer_biblioteca(wb):
    out = []
    for r in ws_rows(wb, "RESOLUCIONES"):
        vals = [limpio(x) for x in r if limpio(x)]
        if not vals or vals == ["ART"]:
            continue
        txt = " — ".join(vals)
        url = re.search(r"https?://\S+", txt)
        out.append({"id": len(out) + 1, "categoria": "ART", "titulo": re.sub(r"\s*:?\s*https?://\S+", "", txt).strip(),
                    "url": url.group(0) if url else None})
    return out


# ================================================================ main

def main():
    a_path, b_path = sys.argv[1], sys.argv[2]
    triunfo_pend = leer_a(a_path)
    wb = openpyxl.load_workbook(b_path, data_only=True)
    leer_art(wb)
    leer_ap(wb)
    leer_patrimoniales(wb)
    procesar_candidatos(triunfo_pend)
    leer_anuladas(wb)
    leer_directorio(wb)
    biblio = leer_biblioteca(wb)

    for n, vs in variantes_vistas.items():
        aseg[n]["variantes"] = sorted(vs - {n})
    for c in clientes:
        c["mail"] = c["_mails"][0] if c["_mails"] else None
        c["telefono"] = c["_tels"][0] if c["_tels"] else None
        extra = []
        if len(c["_mails"]) > 1:
            extra.append("Otros mails: " + ", ".join(c["_mails"][1:]))
        if len(c["_tels"]) > 1:
            extra.append("Otros teléfonos: " + ", ".join(c["_tels"][1:]))
        if extra:
            c["observaciones"] = "; ".join(([c["observaciones"]] if c["observaciones"] else []) + extra)
    pol_out = []
    for p in polizas:
        p["datos"] = {k: v for k, v in p["datos"].items() if v not in (None, "")}
        pol_out.append({k: v for k, v in p.items() if not k.startswith("_")})
    cli_out = [{k: v for k, v in c.items() if not k.startswith("_")} for c in clientes]

    salida = {
        "version": 1, "generado": datetime.now().isoformat(timespec="seconds"), "fecha_referencia": HOY.isoformat(),
        "aseguradoras": sorted(aseg.values(), key=lambda a: a["id"]), "rubros": rubros, "clientes": cli_out,
        "polizas": pol_out, "poliza_items": items, "biblioteca": biblio,
    }
    out = Path(__file__).parent / "salida"
    out.mkdir(exist_ok=True)
    (out / "carga_inicial.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    act = [p for p in pol_out if p["estado"] == "activa"]
    lines = [f"# Informe de carga inicial ({HOY.strftime('%d/%m/%Y')})", "",
             f"- Pólizas activas: **{len(act)}**", f"- En Histórico: **{len(pol_out) - len(act)}**",
             f"- Clientes: **{len(cli_out)}** (con mail: {sum(1 for c in cli_out if c['mail'])}, "
             f"con teléfono: {sum(1 for c in cli_out if c['telefono'])})",
             f"- Aseguradoras: **{len(aseg)}**", f"- Vehículos / ítems: **{len(items)}**",
             f"- Para completar: **{sum(1 for p in act if p['revisar'])}**", "", "## Detalle", ""]
    lines += [f"- {k}: {v}" for k, v in sorted(stats.items())]
    lines += ["", "## Activas por rubro y compañía", ""]
    cnt = defaultdict(int)
    for p in act:
        cnt[(rubros[p["rubro_id"] - 1]["nombre"], next((a["nombre"] for a in aseg.values() if a["id"] == p["aseguradora_id"]), "—"))] += 1
    for (r, a), n in sorted(cnt.items()):
        lines.append(f"- {r} · {a}: {n}")
    lines += ["", "## Variantes de nombre unificadas", ""]
    for n, vs in sorted(variantes_vistas.items()):
        if vs - {n}:
            lines.append(f"- **{n}** ← " + ", ".join(sorted(vs - {n})))
    lines += ["", "## Motivos de «Para completar»", ""]
    mot = defaultdict(int)
    for p in act:
        for m in (p["revisar"] or "").split(" · "):
            if m:
                mot[re.sub(r"«.*?»|\b[A-Z0-9]{6,9}\b también figura en .*", "…", m)] += 1
    lines += [f"- {k}: {v}" for k, v in sorted(mot.items(), key=lambda x: -x[1])]
    (out / "informe.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
