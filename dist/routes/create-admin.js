import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
    console.log('🔧 Préparation de la création / mise à jour de l’administrateur...\n');
    const id_admin = process.env.ADMIN_ID || 'a0000000-0000-0000-0000-000000000001';
    const nom_complet = process.env.ADMIN_NOM || process.env.ADMIN_NAME || 'Administrateur Principal';
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const mot_de_passe_clair = process.env.ADMIN_PASSWORD || process.env.ADMIN_MOT_DE_PASSE;
    if (!email) {
        console.error('❌ Erreur : définis ADMIN_EMAIL dans le fichier .env.');
        process.exit(1);
    }
    if (!mot_de_passe_clair) {
        console.error('❌ Erreur : définis ADMIN_PASSWORD (ou ADMIN_MOT_DE_PASSE) dans le fichier .env.');
        process.exit(1);
    }
    const mot_de_passe_hashe = await bcrypt.hash(mot_de_passe_clair, 10);
    const admin = await prisma.administrateur.upsert({
        where: { id_admin },
        update: {
            nom_complet,
            email,
            mot_de_passe: mot_de_passe_hashe,
            est_actif: true,
        },
        create: {
            id_admin,
            nom_complet,
            email,
            mot_de_passe: mot_de_passe_hashe,
            est_actif: true,
        },
    });
    console.log('✅ Compte Administrateur configuré avec succès dans la base de données !\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 IDENTIFIANTS DE CONNEXION (dashboard + déverrouillage) :');
    console.log(`   • Email         : ${admin.email}`);
    console.log(`   • Mot de passe  : ${mot_de_passe_clair}`);
    console.log(`   • Nom complet   : ${admin.nom_complet}`);
    console.log(`   • Statut        : Actif (${admin.est_actif ? 'Oui' : 'Non'})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Utilise cet email et ce mot de passe sur POST /api/admin/auth/login');
    console.log('   (connexion au dashboard ET déverrouillage des notes passent par ce même compte).');
}
main()
    .catch((e) => {
    console.error('❌ Erreur lors de la création de l’administrateur :', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
