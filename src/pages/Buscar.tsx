import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { ListaPolizas, ordenarPorVto } from '../components/ui'
import { norm, soloDigitos } from '../lib/util'

export default function Buscar() {
  const s = useStore()
  const [sp] = useSearchParams()
  const q = sp.get('q') ?? ''
  const res = useMemo(() => {
    const t = norm(q).trim()
    if (t.length < 2) return null
    const palabras = t.split(/\s+/)
    const dig = soloDigitos(q)
    const usarDig = dig.length >= 4 && dig.length === q.replace(/[\s.\-/]/g, '').length
    const compacto = t.replace(/[^a-z0-9]/g, '')
    const ok = (texto: string) => usarDig
      ? texto.includes(dig)
      : palabras.every((w) => texto.includes(w)) ||
        (compacto.length >= 5 && /\d/.test(compacto) && texto.replace(/[^a-z0-9]/g, '').includes(compacto))
    const clientes = s.clientes.filter((c) => ok(`${norm(c.nombre)} | ${soloDigitos(c.doc)} | ${norm(c.mail)} | ${soloDigitos(c.telefono)}`))
    const polizas = s.polizas.filter((p) => ok(s.textoPoliza.get(p.id) ?? ''))
      .sort((a, b) => (a.estado === b.estado ? ordenarPorVto(a, b) : a.estado === 'activa' ? -1 : 1))
    return { clientes, polizas }
  }, [q, s])

  if (!res) return <div><h1>Buscar</h1><p className="vacio">Escribí al menos 2 letras arriba: nombre, DNI/CUIT, número de póliza o patente.</p></div>
  return (
    <div>
      <h1>Resultados para “{q}”</h1>
      {res.clientes.length > 0 && (
        <>
          <h2>Clientes <span className="cuenta">{res.clientes.length}</span></h2>
          <div className="lista">
            {res.clientes.slice(0, 20).map((c) => {
              const ps = s.polizasDe.get(c.id) ?? []
              const act = ps.filter((p) => p.estado === 'activa').length
              return (
                <Link key={c.id} to={`/cliente/${c.id}`} className="cliente-fila">
                  <div>
                    <div className="pf-nombre">{c.nombre}</div>
                    <div className="pf-sub">{[c.doc, c.telefono, c.mail].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
                  </div>
                  <span className="sutil">{act} activa{act === 1 ? '' : 's'}</span>
                </Link>
              )
            })}
          </div>
        </>
      )}
      <h2>Pólizas <span className="cuenta">{res.polizas.length}</span></h2>
      <ListaPolizas polizas={res.polizas} vacio="No se encontraron pólizas." />
    </div>
  )
}
