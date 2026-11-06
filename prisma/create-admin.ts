import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Préparation de la création / mise à jour de l’administrateur...\n');

  // Récupération des informations depuis le fichier .env
  // Si ADMIN_ID n'est pas fourni, on utilise un UUID par défaut ou un nouveau UUID
  const id_admin = process.env.ADMIN_ID || 'a0000000-0000-0000-0000-000000000001';
  const nom_complet = process.env.ADMIN_NOM || process.env.ADMIN_NAME || 'Administrateur Principal';
  
  // Utilise ADMIN_PASSWORD ou ADMIN_MOT_DE_PASSE ou le DASHBOARD_PASSWORD existant dans .env
  const mot_de_passe_clair = process.env.ADMIN_PASSWORD || process.env.ADMIN_MOT_DE_PASSE || process.env.DASHBOARD_PASSWORD;

  if (!mot_de_passe_clair) {
    console.error('❌ Erreur : aucun mot de passe trouvé dans le fichier .env (veuillez définir ADMIN_PASSWORD ou DASHBOARD_PASSWORD).');
    process.exit(1);
  }

  // Hachage du mot de passe avec bcrypt (10 rounds)
  const mot_de_passe_hashe = await bcrypt.hash(mot_de_passe_clair, 10);

  // Insertion ou mise à jour idempotente dans la table "Administrateur"
  const admin = await prisma.administrateur.upsert({
    where: { id_admin },
    update: {
      nom_complet,
      mot_de_passe: mot_de_passe_hashe,
      est_actif: true,
    },
    create: {
      id_admin,
      nom_complet,
      mot_de_passe: mot_de_passe_hashe,
      est_actif: true,
    },
  });

  console.log('✅ Compte Administrateur configuré avec succès dans la base de données !\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 IDENTIFIANTS DE CONNEXION POUR LE DÉVERROUILLAGE :');
  console.log(`   • Identifiant (id / id_admin) : ${admin.id_admin}`);
  console.log(`   • Nom complet                 : ${admin.nom_complet}`);
  console.log(`   • Mot de passe                : ${mot_de_passe_clair}`);
  console.log(`   • Statut                      : Actif (${admin.est_actif ? 'Oui' : 'Non'})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💡 Vous pouvez utiliser cet Identifiant et ce Mot de passe dans la boîte de dialogue');
  console.log('   "Déverrouiller Éva de niveau 1 (Admin)" sur le Frontend pour débloquer les notes.');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors de la création de l’administrateur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
