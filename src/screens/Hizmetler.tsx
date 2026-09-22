import { Ikon } from '../lib/Ikon'

/** Hizmetler, içerik ve kuralları tamamlanana kadar yalnızca durum ekranıdır. */
export default function Hizmetler() {
  return (
    <section className="yakinda" aria-labelledby="hizmetler-baslik">
      <span className="yakinda-ikon" aria-hidden="true">
        <Ikon ad="hediye" boy={28} />
      </span>
      <h1 id="hizmetler-baslik">Hizmetler</h1>
      <p>Hazırlanıyor — yakında burada.</p>
    </section>
  )
}
