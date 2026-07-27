import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

type InvitationRow = {
  id: string;
  email: string;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
};

export class PreventDuplicateTeamInvitations1724100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.addColumn('team_invitations',new TableColumn({
      name:'pendingEmail',
      type:'varchar',
      isNullable:true,
    }));

    const escape=(name:string)=>queryRunner.connection.driver.escape(name);
    const parameter=(position:number)=>queryRunner.connection.options.type==='postgres'?`$${position}`:'?';
    const invitations=await queryRunner.query(
      `SELECT ${escape('id')}, ${escape('email')}, ${escape('acceptedAt')}, ${escape('revokedAt')}, ${escape('createdAt')} FROM ${escape('team_invitations')}`,
    ) as InvitationRow[];
    const users=await queryRunner.query(
      `SELECT ${escape('email')} FROM ${escape('users')}`,
    ) as Array<{email:string}>;
    const registered=new Set(users.map(row=>row.email.trim().toLowerCase()));
    const claimedPendingEmails=new Set<string>();

    invitations.sort((left,right)=>
      new Date(left.createdAt).getTime()-new Date(right.createdAt).getTime() || left.id.localeCompare(right.id),
    );
    for(const invitation of invitations){
      const email=invitation.email.trim().toLowerCase();
      const isPending=!invitation.acceptedAt&&!invitation.revokedAt;
      const keepPending=isPending&&!registered.has(email)&&!claimedPendingEmails.has(email);
      if(keepPending)claimedPendingEmails.add(email);
      await queryRunner.query(
        `UPDATE ${escape('team_invitations')} SET ${escape('email')} = ${parameter(1)}, ${escape('pendingEmail')} = ${parameter(2)}, ${escape('revokedAt')} = ${parameter(3)} WHERE ${escape('id')} = ${parameter(4)}`,
        [email,keepPending?email:null,isPending&&!keepPending?new Date():invitation.revokedAt??null,invitation.id],
      );
    }

    await queryRunner.createIndex('team_invitations',new TableIndex({
      name:'IDX_team_invitations_one_pending_email',
      columnNames:['pendingEmail'],
      isUnique:true,
    }));
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.dropIndex('team_invitations','IDX_team_invitations_one_pending_email');
    await queryRunner.dropColumn('team_invitations','pendingEmail');
  }
}
